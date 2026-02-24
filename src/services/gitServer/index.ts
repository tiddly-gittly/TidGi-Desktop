import { spawn as gitSpawn } from 'dugite';
import { injectable } from 'inversify';
import { Observable } from 'rxjs';

import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { isWikiWorkspace } from '@services/workspaces/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import type { GitHTTPResponseChunk, IGitServerService } from './interface';
import { DESKTOP_GIT_IDENTITY, mergeMobileIncomingIfExists, runGitCollectStdout } from './mergeUtilities';

/**
 * Git Smart HTTP Server Service
 * Handles Git Smart HTTP protocol for mobile client sync
 */
@injectable()
export class GitServerService implements IGitServerService {
  private async getWorkspaceById(workspaceId: string) {
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    return await workspaceService.get(workspaceId);
  }

  private async ensureCommittedBeforeServe(repoPath: string): Promise<void> {
    const statusOutput = await runGitCollectStdout(['status', '--porcelain'], repoPath);
    if (statusOutput.trim().length === 0) return;

    const addAll = gitSpawn(['add', '-A'], repoPath);
    await new Promise<void>((resolve) => {
      addAll.on('close', () => {
        resolve();
      });
    });

    const commit = gitSpawn(['commit', '-m', `Auto commit before mobile sync ${new Date().toISOString()}`], repoPath, {
      env: { ...process.env, ...DESKTOP_GIT_IDENTITY },
    });
    await new Promise<void>((resolve) => {
      commit.on('close', () => {
        resolve();
      });
    });
  }

  private async ensureReceivePackConfig(repoPath: string): Promise<void> {
    await runGitCollectStdout(['config', 'receive.denyCurrentBranch', 'updateInstead'], repoPath);
  }

  public async getWorkspaceRepoPath(workspaceId: string): Promise<string | undefined> {
    const workspace = await this.getWorkspaceById(workspaceId);
    if (!workspace || !isWikiWorkspace(workspace)) {
      return undefined;
    }
    return workspace.wikiFolderLocation;
  }

  private async resolveRepoPathOrError(workspaceId: string, subscriber: import('rxjs').Subscriber<GitHTTPResponseChunk>): Promise<string | undefined> {
    const repoPath = await this.getWorkspaceRepoPath(workspaceId);
    if (!repoPath) {
      subscriber.next({ type: 'headers', statusCode: 404, headers: { 'Content-Type': 'text/plain' } });
      subscriber.next({ type: 'data', data: new Uint8Array(Buffer.from('Workspace not found')) });
      subscriber.complete();
      return undefined;
    }
    return repoPath;
  }

  public gitSmartHTTPInfoRefs$(workspaceId: string, service: string): Observable<GitHTTPResponseChunk> {
    return new Observable<GitHTTPResponseChunk>((subscriber) => {
      void (async () => {
        try {
          const repoPath = await this.resolveRepoPathOrError(workspaceId, subscriber);
          if (!repoPath) return;
          if (service === 'git-receive-pack') {
            await this.ensureReceivePackConfig(repoPath);
          }
          if (service === 'git-upload-pack') {
            await this.ensureCommittedBeforeServe(repoPath);
          }

          subscriber.next({
            type: 'headers',
            statusCode: 200,
            headers: {
              'Content-Type': `application/x-${service}-advertisement`,
              'Cache-Control': 'no-cache',
            },
          });

          // Service announcement pkt-line
          const announcement = `# service=${service}\n`;
          const pktLength = (announcement.length + 4).toString(16).padStart(4, '0');
          subscriber.next({ type: 'data', data: new Uint8Array(Buffer.from(`${pktLength}${announcement}0000`)) });

          const git = gitSpawn([service.replace('git-', ''), '--stateless-rpc', '--advertise-refs', repoPath], repoPath, {
            env: { GIT_PROJECT_ROOT: repoPath, GIT_HTTP_EXPORT_ALL: '1' },
          });

          git.stdout.on('data', (data: Buffer) => {
            subscriber.next({ type: 'data', data: new Uint8Array(data) });
          });
          git.stderr.on('data', (data: Buffer) => {
            logger.debug('Git info/refs stderr:', { data: data.toString(), workspaceId });
          });
          git.on('error', (error: Error) => {
            subscriber.error(error);
          });
          git.on('close', (code: number | null) => {
            if (code !== 0 && code !== null) {
              logger.error('Git info/refs exited with non-zero code', { code, workspaceId });
            }
            subscriber.complete();
          });
        } catch (error) {
          subscriber.error(error);
        }
      })();
    });
  }

  public gitSmartHTTPUploadPack$(workspaceId: string, requestBody: Uint8Array): Observable<GitHTTPResponseChunk> {
    return new Observable<GitHTTPResponseChunk>((subscriber) => {
      void (async () => {
        try {
          const repoPath = await this.resolveRepoPathOrError(workspaceId, subscriber);
          if (!repoPath) return;
          await this.ensureCommittedBeforeServe(repoPath);

          logger.debug('Git upload-pack start', { workspaceId, repoPath, requestBodySize: requestBody.length });

          subscriber.next({
            type: 'headers',
            statusCode: 200,
            headers: {
              'Content-Type': 'application/x-git-upload-pack-result',
              'Cache-Control': 'no-cache',
            },
          });

          const git = gitSpawn(['upload-pack', '--stateless-rpc', repoPath], repoPath, {
            env: { GIT_PROJECT_ROOT: repoPath, GIT_HTTP_EXPORT_ALL: '1' },
          });

          git.stdin.on('error', (error: Error) => {
            logger.debug('Git upload-pack stdin error:', { error: error.message, workspaceId });
          });
          git.stdout.on('data', (data: Buffer) => {
            subscriber.next({ type: 'data', data: new Uint8Array(data) });
          });
          git.stderr.on('data', (data: Buffer) => {
            logger.debug('Git upload-pack stderr:', { data: data.toString(), workspaceId });
          });
          git.on('error', (error: Error) => {
            subscriber.error(error);
          });
          git.on('close', (code: number | null) => {
            if (code !== 0 && code !== null) {
              logger.error('Git upload-pack exited with non-zero code', { code, workspaceId });
            }
            subscriber.complete();
          });

          git.stdin.end(Buffer.from(requestBody));
        } catch (error) {
          subscriber.error(error);
        }
      })();
    });
  }

  public gitSmartHTTPReceivePack$(workspaceId: string, requestBody: Uint8Array): Observable<GitHTTPResponseChunk> {
    return new Observable<GitHTTPResponseChunk>((subscriber) => {
      void (async () => {
        try {
          const repoPath = await this.resolveRepoPathOrError(workspaceId, subscriber);
          if (!repoPath) return;
          await this.ensureCommittedBeforeServe(repoPath);
          await this.ensureReceivePackConfig(repoPath);
          const workspace = await this.getWorkspaceById(workspaceId);
          if (workspace && isWikiWorkspace(workspace) && workspace.readOnlyMode) {
            subscriber.next({
              type: 'headers',
              statusCode: 403,
              headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-cache' },
            });
            subscriber.next({ type: 'data', data: new Uint8Array(Buffer.from('Workspace is read-only')) });
            subscriber.complete();
            return;
          }

          subscriber.next({
            type: 'headers',
            statusCode: 200,
            headers: {
              'Content-Type': 'application/x-git-receive-pack-result',
              'Cache-Control': 'no-cache',
            },
          });

          const git = gitSpawn(['-c', 'receive.denyCurrentBranch=updateInstead', 'receive-pack', '--stateless-rpc', repoPath], repoPath, {
            env: { GIT_PROJECT_ROOT: repoPath },
          });

          git.stdin.on('error', (error: Error) => {
            logger.debug('Git receive-pack stdin error:', { error: error.message, workspaceId });
          });
          git.stdout.on('data', (data: Buffer) => {
            subscriber.next({ type: 'data', data: new Uint8Array(data) });
          });
          git.stderr.on('data', (data: Buffer) => {
            logger.debug('Git receive-pack stderr:', { data: data.toString(), workspaceId });
          });
          git.on('error', (error: Error) => {
            subscriber.error(error);
          });
          git.on('close', (code: number | null) => {
            if (code !== 0 && code !== null) {
              logger.error('Git receive-pack exited with non-zero code', { code, workspaceId });
            }
            subscriber.complete();
          });

          git.stdin.end(Buffer.from(requestBody));
        } catch (error) {
          subscriber.error(error);
        }
      })();
    });
  }

  /**
   * Called by the merge-incoming HTTP endpoint AFTER receive-pack completes.
   * Runs on desktop main process where dugite is available.
   */
  public async mergeAfterPush(workspaceId: string): Promise<void> {
    const repoPath = await this.getWorkspaceRepoPath(workspaceId);
    if (!repoPath) return;
    await mergeMobileIncomingIfExists(repoPath);
  }
}
