import { spawn as gitSpawn } from 'dugite';
import { injectable } from 'inversify';
import fs from 'node:fs/promises';
import path from 'node:path';

import { container } from '@services/container';
import serviceIdentifier from '@services/serviceIdentifier';
import { isWikiWorkspace } from '@services/workspaces/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import type { IGitServerService } from './interface';

/**
 * Generic git primitives exposed to TiddlyWiki plugins.
 *
 * Mobile-sync-specific algorithms (Smart HTTP, archive generation,
 * merge-incoming) have moved to the tw-mobile-sync plugin. Desktop keeps
 * only the low-level dugite-backed primitives so plugins can optionally
 * delegate git execution to the desktop process via the "desktop" runner.
 */
@injectable()
export class GitServerService implements IGitServerService {
  private async getWorkspaceById(workspaceId: string) {
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    return await workspaceService.get(workspaceId);
  }

  public async getWorkspaceRepoPath(workspaceId: string): Promise<string | undefined> {
    const workspace = await this.getWorkspaceById(workspaceId);
    if (!workspace || !isWikiWorkspace(workspace)) {
      return undefined;
    }
    return workspace.wikiFolderLocation;
  }

  public async readWorkspaceFile(workspaceId: string, relativePath: string): Promise<string | undefined> {
    const repoPath = await this.getWorkspaceRepoPath(workspaceId);
    if (!repoPath) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }
    const fullPath = path.resolve(repoPath, relativePath);
    const relative = path.relative(repoPath, fullPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Path traversal not allowed');
    }
    try {
      return await fs.readFile(fullPath, 'utf-8');
    } catch {
      return undefined;
    }
  }

  public async writeWorkspaceFile(workspaceId: string, relativePath: string, content: string): Promise<void> {
    const repoPath = await this.getWorkspaceRepoPath(workspaceId);
    if (!repoPath) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }
    const fullPath = path.resolve(repoPath, relativePath);
    const relative = path.relative(repoPath, fullPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Path traversal not allowed');
    }
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  public async runGitCommand(
    workspaceId: string,
    gitArguments: string[],
    environment?: Record<string, string>,
  ): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
    const repoPath = await this.getWorkspaceRepoPath(workspaceId);
    if (!repoPath) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }
    const child = gitSpawn(gitArguments, repoPath, environment ? { env: { ...process.env, ...environment } } : undefined);
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    });
    return { exitCode, stdout, stderr };
  }

  public async writeTempGitFile(workspaceId: string, fileName: string, data: Uint8Array): Promise<string> {
    const repoPath = await this.getWorkspaceRepoPath(workspaceId);
    if (!repoPath) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }
    const sanitized = path.basename(fileName);
    const filePath = path.join(repoPath, '.git', sanitized);
    await fs.writeFile(filePath, Buffer.from(data));
    return filePath;
  }

  public async deleteTempGitFile(workspaceId: string, fileName: string): Promise<void> {
    const repoPath = await this.getWorkspaceRepoPath(workspaceId);
    if (!repoPath) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }
    const sanitized = path.basename(fileName);
    const filePath = path.join(repoPath, '.git', sanitized);
    try {
      await fs.unlink(filePath);
    } catch {
      // Ignore if file doesn't exist
    }
  }
}
