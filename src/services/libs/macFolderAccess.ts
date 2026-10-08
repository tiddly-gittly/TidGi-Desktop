import { app } from 'electron';
import { opendir } from 'node:fs/promises';
import path from 'node:path';

interface FolderAccessOptions {
  platform: NodeJS.Platform;
  protectedFolders: () => string[];
  readDirectory: (folder: string) => Promise<void>;
}

/** Separate human-paced macOS consent from timed filesystem/worker startup. */
export class MacFolderAccessGate {
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

export const macFolderAccessGate = new MacFolderAccessGate({
  platform: process.platform,
  protectedFolders: () => [app.getPath('desktop'), app.getPath('documents'), app.getPath('downloads')],
  readDirectory: async (folder) => {
    const directory = await opendir(folder);
    await directory.close();
  },
});
