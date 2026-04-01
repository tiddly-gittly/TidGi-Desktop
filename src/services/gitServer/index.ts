import { spawn as gitSpawn } from 'dugite';
import { injectable } from 'inversify';
import type { ChildProcess } from 'node:child_process';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Observable } from 'rxjs';

import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { isWikiWorkspace } from '@services/workspaces/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import type { GitHTTPResponseChunk, IGitServerService } from './interface';
import { DESKTOP_GIT_IDENTITY, mergeMobileIncomingIfExists, runGit, runGitCollectStdout } from './mergeUtilities';

const ALLOWED_GIT_SERVICES = new Set(['git-upload-pack', 'git-receive-pack']);

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

    const { exitCode: addCode, stderr: addStderr } = await runGit(['add', '-A'], repoPath);
    if (addCode !== 0) {
      logger.warn('git add -A failed before mobile sync', { repoPath, addCode, addStderr });
      return;
    }

    const { exitCode: commitCode, stderr: commitStderr } = await runGit(
      ['commit', '-m', `Auto commit before mobile sync ${new Date().toISOString()}`],
      repoPath,
      { env: { ...process.env, ...DESKTOP_GIT_IDENTITY } },
    );
    if (commitCode !== 0) {
      logger.warn('Auto commit before mobile sync failed (ignored)', { repoPath, commitCode, commitStderr });
      return;
    }

    // Pack loose objects so subsequent clones don't have to compress on-the-fly.
    // --auto only runs when git decides the repo has enough loose objects to warrant it.
    const { exitCode: gcCode } = await runGit(['gc', '--auto', '--quiet'], repoPath);
    if (gcCode !== 0) {
      logger.debug('git gc --auto returned non-zero (non-fatal)', { repoPath, gcCode });
    }
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
      let git: ChildProcess | undefined;
      void (async () => {
        try {
          if (!ALLOWED_GIT_SERVICES.has(service)) {
            subscriber.next({ type: 'headers', statusCode: 400, headers: { 'Content-Type': 'text/plain' } });
            subscriber.next({ type: 'data', data: new Uint8Array(Buffer.from('Invalid service')) });
            subscriber.complete();
            return;
          }
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

          git = gitSpawn([service.replace('git-', ''), '--stateless-rpc', '--advertise-refs', repoPath], repoPath, {
            env: { GIT_PROJECT_ROOT: repoPath, GIT_HTTP_EXPORT_ALL: '1' },
          });
          if (!git.stdout || !git.stderr) {
            throw new Error('Git stdio streams are unavailable for info/refs');
          }

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
      return () => {
        git?.kill();
      };
    });
  }

  public gitSmartHTTPUploadPack$(workspaceId: string, requestBody: Uint8Array): Observable<GitHTTPResponseChunk> {
    return new Observable<GitHTTPResponseChunk>((subscriber) => {
      let git: ChildProcess | undefined;
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

          git = gitSpawn(['upload-pack', '--stateless-rpc', repoPath], repoPath, {
            env: { GIT_PROJECT_ROOT: repoPath, GIT_HTTP_EXPORT_ALL: '1' },
          });
          if (!git.stdin || !git.stdout || !git.stderr) {
            throw new Error('Git stdio streams are unavailable for upload-pack');
          }

          git.stdin.on('error', (error: Error) => {
            logger.debug('Git upload-pack stdin error:', { error: error.message, workspaceId });
            git?.kill();
            subscriber.error(error);
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
      return () => {
        git?.kill();
      };
    });
  }

  public gitSmartHTTPReceivePack$(workspaceId: string, requestBody: Uint8Array): Observable<GitHTTPResponseChunk> {
    return new Observable<GitHTTPResponseChunk>((subscriber) => {
      let git: ChildProcess | undefined;
      void (async () => {
        try {
          const repoPath = await this.resolveRepoPathOrError(workspaceId, subscriber);
          if (!repoPath) return;
          // Check readOnly before expensive git operations
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
          await this.ensureCommittedBeforeServe(repoPath);
          await this.ensureReceivePackConfig(repoPath);

          subscriber.next({
            type: 'headers',
            statusCode: 200,
            headers: {
              'Content-Type': 'application/x-git-receive-pack-result',
              'Cache-Control': 'no-cache',
            },
          });

          git = gitSpawn(['-c', 'receive.denyCurrentBranch=updateInstead', 'receive-pack', '--stateless-rpc', repoPath], repoPath, {
            env: { GIT_PROJECT_ROOT: repoPath },
          });
          if (!git.stdin || !git.stdout || !git.stderr) {
            throw new Error('Git stdio streams are unavailable for receive-pack');
          }

          git.stdin.on('error', (error: Error) => {
            logger.debug('Git receive-pack stdin error:', { error: error.message, workspaceId });
            git?.kill();
            subscriber.error(error);
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
      return () => {
        git?.kill();
      };
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

  // ── Full Archive for fast mobile clone ────────────────────────────────
  //
  // Instead of the standard git-upload-pack protocol (which forces the mobile
  // device to resolve deltas and checkout 19000+ files one by one in JS),
  // we generate a tar archive containing the entire working tree plus a
  // minimal .git directory.  Mobile downloads this (with Range/resume
  // support) and extracts natively — skipping all the slow JS steps.
  //
  // Strategy (zero extra npm dependencies):
  //  1. `git archive --format=tar HEAD` → working tree tar (excludes .git/)
  //  2. System `tar` command to append .git metadata files
  //  3. Concatenate into one archive on disk, cache by HEAD commit hash

  /**
   * In-memory cache: workspaceId → { commitHash, archivePath, timestamp }.
   * Invalidated when HEAD changes.
   */
  private archiveCache = new Map<string, { commitHash: string; archivePath: string; timestamp: number }>();

  /**
   * Generate (or return cached) a tar archive of the workspace repo.
   *
   * Returns the path to the tar file on disk, plus the HEAD commit hash (for ETag).
   */
  public async generateFullArchive(workspaceId: string): Promise<{ archivePath: string; commitHash: string; sizeBytes: number } | undefined> {
    const repoPath = await this.getWorkspaceRepoPath(workspaceId);
    if (!repoPath) return undefined;

    // Ensure everything is committed
    await this.ensureCommittedBeforeServe(repoPath);

    // Get HEAD commit hash
    const commitHash = (await runGitCollectStdout(['rev-parse', 'HEAD'], repoPath)).trim();
    if (!commitHash) return undefined;

    // Check cache
    const cached = this.archiveCache.get(workspaceId);
    if (cached && cached.commitHash === commitHash) {
      try {
        const stat = await fs.stat(cached.archivePath);
        return { archivePath: cached.archivePath, commitHash, sizeBytes: stat.size };
      } catch {
        // Cache file gone, regenerate
      }
    }

    logger.info('Generating full archive for mobile sync', { workspaceId, commitHash });

    const cacheDirectory = path.join(repoPath, '.git', 'tidgi-archive-cache');
    await fs.mkdir(cacheDirectory, { recursive: true });
    const archivePath = path.join(cacheDirectory, `full-archive-${commitHash.slice(0, 12)}.tar`);

    // Clean old archives
    try {
      for (const file of await fs.readdir(cacheDirectory)) {
        if (file.startsWith('full-archive-') && file !== path.basename(archivePath)) {
          await fs.unlink(path.join(cacheDirectory, file)).catch(() => {});
        }
      }
    } catch { /* non-fatal */ }

    // Return cached file if it already exists on disk
    try {
      const stat = await fs.stat(archivePath);
      this.archiveCache.set(workspaceId, { commitHash, archivePath, timestamp: Date.now() });
      return { archivePath, commitHash, sizeBytes: stat.size };
    } catch { /* need to generate */ }

    // ── Step 1: Create working-tree tar via `git archive` ────────────
    // `git archive` is fast (C code), respects .gitattributes export-ignore,
    // and only includes tracked files — exactly what we want.
    const { exitCode: archiveCode } = await runGit(
      ['archive', '--format=tar', '-o', archivePath, 'HEAD'],
      repoPath,
    );
    if (archiveCode !== 0) {
      logger.error('git archive failed', { workspaceId, archiveCode });
      return undefined;
    }

    // ── Step 2: Prepare a staging directory with .git metadata ───────
    // We create a temp directory that mirrors the .git structure we need,
    // then use system `tar` to append it to the archive.
    const stagingDirectory = path.join(cacheDirectory, 'staging');
    const stagingGit = path.join(stagingDirectory, '.git');
    await fs.rm(stagingDirectory, { recursive: true, force: true });

    const gitDirectory = path.join(repoPath, '.git');

    // Copy the minimal .git files needed for isomorphic-git
    // HEAD
    await fs.mkdir(stagingGit, { recursive: true });
    await fs.copyFile(path.join(gitDirectory, 'HEAD'), path.join(stagingGit, 'HEAD'));

    // config — rewrite to a mobile-friendly placeholder
    const configContent = [
      '[core]',
      '\trepositoryformatversion = 0',
      '\tfilemode = false',
      '\tbare = false',
      '[remote "origin"]',
      '\turl = PLACEHOLDER',
      '\tfetch = +refs/heads/*:refs/remotes/origin/*',
      '',
    ].join('\n');
    await fs.writeFile(path.join(stagingGit, 'config'), configContent);

    // packed-refs
    try {
      await fs.copyFile(path.join(gitDirectory, 'packed-refs'), path.join(stagingGit, 'packed-refs'));
    } catch {
      /* optional */
    }

    // shallow
    try {
      await fs.copyFile(path.join(gitDirectory, 'shallow'), path.join(stagingGit, 'shallow'));
    } catch {
      /* optional */
    }

    // refs/ (recursive copy)
    await copyDirectoryRecursive(path.join(gitDirectory, 'refs'), path.join(stagingGit, 'refs'));

    // objects/pack/ (the big .pack + .idx files)
    const sourcePackDirectory = path.join(gitDirectory, 'objects', 'pack');
    const destinationPackDirectory = path.join(stagingGit, 'objects', 'pack');
    try {
      const packFiles = await fs.readdir(sourcePackDirectory);
      if (packFiles.length > 0) {
        await fs.mkdir(destinationPackDirectory, { recursive: true });
        for (const f of packFiles) {
          if (f.endsWith('.pack') || f.endsWith('.idx')) {
            await fs.copyFile(path.join(sourcePackDirectory, f), path.join(destinationPackDirectory, f));
          }
        }
      }
    } catch { /* no pack files */ }

    // loose objects (2-char hex subdirs)
    const sourceObjectDirectory = path.join(gitDirectory, 'objects');
    try {
      for (const entry of await fs.readdir(sourceObjectDirectory)) {
        if (entry.length === 2 && /^[\da-f]{2}$/.test(entry)) {
          const sourceSubDirectory = path.join(sourceObjectDirectory, entry);
          const destinationSubDirectory = path.join(stagingGit, 'objects', entry);
          await copyDirectoryRecursive(sourceSubDirectory, destinationSubDirectory);
        }
      }
    } catch { /* no loose objects */ }

    // ── Step 3: Append .git/ staging into the tar ────────────────────
    // Use system tar (bsdtar on Win10+, GNU tar on Linux/macOS).
    // `--append` adds to an existing archive.
    await new Promise<void>((resolve, reject) => {
      execFile(
        'tar',
        ['--append', '-f', archivePath, '-C', stagingDirectory, '.git'],
        { timeout: 120_000 },
        (error) => {
          if (error) reject(error instanceof Error ? error : new Error('tar append failed'));
          else resolve();
        },
      );
    });

    // Clean up staging
    await fs.rm(stagingDirectory, { recursive: true, force: true });

    const stat = await fs.stat(archivePath);
    this.archiveCache.set(workspaceId, { commitHash, archivePath, timestamp: Date.now() });

    logger.info('Full archive generated', { workspaceId, commitHash, sizeBytes: stat.size });
    return { archivePath, commitHash, sizeBytes: stat.size };
  }
}

/** Recursively copy a directory. */
async function copyDirectoryRecursive(source: string, destination: string): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(source);
  } catch {
    return;
  }
  await fs.mkdir(destination, { recursive: true });
  for (const entry of entries) {
    const sourcePath = path.join(source, entry);
    const destinationPath = path.join(destination, entry);
    const stat = await fs.stat(sourcePath);
    if (stat.isDirectory()) {
      await copyDirectoryRecursive(sourcePath, destinationPath);
    } else if (stat.isFile()) {
      await fs.copyFile(sourcePath, destinationPath);
    }
  }
}
