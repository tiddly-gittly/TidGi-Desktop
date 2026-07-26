import path from 'node:path';
import nsfw from 'nsfw';

interface IFileSystemWatcherProviderOptions {
  directory: string;
  isIgnored: (filePath: string) => boolean;
  onError: (error: Error) => void;
  onEvent: (filePath: string, eventType: 'add' | 'change' | 'unlink') => void;
}

export const name = 'tidgi-nsfw';

function getEventFilePath(event: nsfw.FileChangeEvent): string | undefined {
  if ('file' in event) {
    return path.join(event.directory, event.file);
  }
  if ('newFile' in event) {
    return path.join(event.newDirectory, event.newFile);
  }
}

export async function create(options: IFileSystemWatcherProviderOptions): Promise<{ close: () => Promise<void> }> {
  const watcher = await nsfw(
    options.directory,
    (events) => {
      for (const event of events) {
        if (event.action === nsfw.actions.RENAMED && 'oldFile' in event && 'newFile' in event) {
          const oldPath = path.join(event.directory, event.oldFile);
          const newPath = path.join(event.newDirectory, event.newFile);
          // The upstream adaptor applies its exclusion policy immediately
          // before scheduling. Keep this provider transport-only so deleted
          // paths (which can no longer be statted) are not discarded here.
          options.onEvent(oldPath, 'unlink');
          options.onEvent(newPath, 'add');
          continue;
        }
        const filePath = getEventFilePath(event);
        if (!filePath) {
          continue;
        }
        if (event.action === nsfw.actions.CREATED) {
          options.onEvent(filePath, 'add');
        } else if (event.action === nsfw.actions.MODIFIED) {
          options.onEvent(filePath, 'change');
        } else if (event.action === nsfw.actions.DELETED) {
          options.onEvent(filePath, 'unlink');
        }
      }
    },
    {
      debounceMS: 100,
      errorCallback: options.onError,
    },
  );
  await watcher.start();
  console.log(`[test-id-WATCH_FS_STABILIZED] NSFW watcher ready for ${options.directory}`);
  return {
    close: async () => watcher.stop(),
  };
}
