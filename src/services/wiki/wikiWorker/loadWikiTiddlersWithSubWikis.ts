import type { LogContext } from '@services/libs/log/schema';
import type { IWikiWorkspace } from '@services/workspaces/interface';
import { realpathSync } from 'node:fs';
import type { TiddlyWiki } from 'tiddlywiki';
import { resolveFolderTiddlerStoragePath, scanFolderTiddlers } from './folderTiddlerLoader';
import { logForBestEffort, type WorkerLogSink } from './workerLogging';

/**
 * Wrap TiddlyWiki's wiki loader to support TidGi folder-as-tiddlers workspaces
 * and configured sub-wikis without loading any physical root twice.
 */
export function createLoadWikiTiddlersWithSubWikis(
  wikiInstance: ReturnType<typeof TiddlyWiki>,
  homePath: string,
  subWikis: IWikiWorkspace[],
  options: {
    folderAsTiddlerStorage?: boolean;
  } = {},
  logContext: LogContext,
  nativeLogger: WorkerLogSink,
) {
  const { folderAsTiddlerStorage = false } = options;
  const originalLoadWikiTiddlers = wikiInstance.loadWikiTiddlers.bind(wikiInstance);
  const loadedFolderRoots = new Set<string>();

  const loadFolderRoot = (folderPath: string): void => {
    const canonicalFolderPath = realpathSync(folderPath);
    if (loadedFolderRoots.has(canonicalFolderPath)) return;
    loadedFolderRoots.add(canonicalFolderPath);

    const scan = scanFolderTiddlers(wikiInstance, canonicalFolderPath, {
      onProgress: ({ scannedFileCount, storagePath }) => {
        void logForBestEffort(nativeLogger, logContext, 'debug', `Folder tiddler scan progress: ${scannedFileCount} files from ${storagePath}`);
      },
    });
    for (const tiddlerFile of scan.files) {
      if (tiddlerFile.filepath) {
        for (const tiddler of tiddlerFile.tiddlers) {
          wikiInstance.boot.files[tiddler.title] = {
            filepath: tiddlerFile.filepath,
            type: tiddlerFile.type ?? 'application/x-tiddler',
            hasMetaFile: tiddlerFile.hasMetaFile ?? false,
            isEditableFile: tiddlerFile.isEditableFile ?? true,
          };
        }
      }
      wikiInstance.wiki.addTiddlers(tiddlerFile.tiddlers);
    }
    void logForBestEffort(
      nativeLogger,
      logContext,
      'info',
      `Loaded ${scan.files.length} tiddler files from bounded folder storage: ${scan.storagePath}`,
    );
  };

  return function loadWikiTiddlersWithSubWikis(
    wikiPath: string,
    loadOptions?: { parentPaths?: string[]; readOnly?: boolean },
  ) {
    // Standard and folder-as-tiddlers workspaces are mutually exclusive. The
    // old path called the stock loader and then recursively loaded the same
    // physical root, duplicating tiddlers and scanning unrelated files.
    let wikiInfo: ReturnType<typeof originalLoadWikiTiddlers>;
    if (folderAsTiddlerStorage && wikiPath === homePath) {
      wikiInstance.boot.wikiTiddlersPath = resolveFolderTiddlerStoragePath(homePath);
      loadFolderRoot(homePath);
      wikiInfo = null;
    } else {
      if (wikiPath === homePath) loadedFolderRoots.add(realpathSync(homePath));
      wikiInfo = originalLoadWikiTiddlers(wikiPath, loadOptions);
    }

    // Included standard wikis recurse through this wrapper. Only the physical
    // home root may inject configured TidGi sub-wikis.
    if (wikiPath !== homePath) return wikiInfo;
    for (const subWiki of subWikis) {
      try {
        loadFolderRoot(subWiki.wikiFolderLocation);
      } catch (error) {
        void logForBestEffort(
          nativeLogger,
          logContext,
          'error',
          `Failed to load sub-wiki tiddlers from ${subWiki.wikiFolderLocation}: ${(error as Error).message}`,
        );
      }
    }
    return wikiInfo;
  };
}
