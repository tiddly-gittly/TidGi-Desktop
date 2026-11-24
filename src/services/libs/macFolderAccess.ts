import { app } from 'electron';
import path from 'node:path';
import { deserializeError } from 'serialize-error';
import { logger } from './log';

interface FolderAccessOptions {
  platform: NodeJS.Platform;
  protectedFolders: () => string[];
  readDirectory: (folder: string) => Promise<void>;
}

/** Check directory access before timed startup; macOS may defer the read for human-paced consent. */
export class MacFolderAccess {
  private readonly granted = new Set<string>();
  private readonly pending = new Map<string, Promise<void>>();

  constructor(private readonly options: FolderAccessOptions) {}

  public folderNeedingAccess(wikiFolder: string): string | undefined {
    if (this.options.platform !== 'darwin') return undefined;
    return this.options.protectedFolders().find((folder) => {
      const relative = path.relative(folder, wikiFolder);
      return !this.granted.has(folder) && (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)));
    });
  }

  public async waitForAccess(wikiFolder: string, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    const folder = this.folderNeedingAccess(wikiFolder);
    if (folder === undefined) return;
    let request = this.pending.get(folder);
    if (request === undefined) {
      request = this.options.readDirectory(folder).then(() => {
        this.granted.add(folder);
      }).finally(() => {
        this.pending.delete(folder);
      });
      this.pending.set(folder, request);
    }
    if (signal === undefined) {
      await request;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        reject(signal.reason instanceof Error ? signal.reason : new Error('Folder access wait cancelled', { cause: signal.reason }));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
      void request.then(resolve, reject).finally(() => {
        signal.removeEventListener('abort', onAbort);
      });
    });
  }
}

const probeShutdown = new AbortController();

export function stopMacFolderAccessChecks(): void {
  probeShutdown.abort(new Error('Folder access check cancelled during application shutdown'));
}

export async function probeMacDirectory(folder: string, signal: AbortSignal): Promise<void> {
  const { default: startProbe } = await import('./macFolderProbeWorker?utilityProcess');
  signal.throwIfAborted();

  // A macOS consent request can keep opendir blocked in an OS call. Keep it outside the main process's libuv pool.
  const worker = startProbe({ serviceName: 'wiki-folder-access', env: { ...process.env, TIDGI_ACCESS_CHECK_DIRECTORY: folder } });
  await new Promise<void>((resolve, reject) => {
    const stop = () => {
      worker.kill();
      reject(new Error('Folder access check cancelled during application shutdown', { cause: signal.reason }));
    };
    signal.addEventListener('abort', stop, { once: true });
    worker.once('spawn', () => {
      if (signal.aborted) worker.kill();
    });
    worker.once('error', (type, location) => {
      reject(new Error(`Folder access process failed: ${type} at ${location}`));
    });
    worker.once('message', (failure: unknown) => {
      if (failure === null) resolve();
      else reject(deserializeError(failure));
    });
    worker.once('exit', (code) => {
      signal.removeEventListener('abort', stop);
      reject(new Error(`Folder access process exited (${code})`));
    });
  });
}

export const macFolderAccess = new MacFolderAccess({
  platform: process.platform,
  protectedFolders: () => [app.getPath('desktop'), app.getPath('documents'), app.getPath('downloads')],
  readDirectory: async (folder) => {
    const startedAt = performance.now();
    logger.debug('Workspace directory access check started', { folder });
    await probeMacDirectory(folder, probeShutdown.signal);
    logger.debug('Workspace directory access check completed', { folder, elapsedMs: performance.now() - startedAt });
  },
});
