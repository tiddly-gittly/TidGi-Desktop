import type { LogContext } from '@services/libs/log/schema';
import type { IWikiWorkspace } from '@services/workspaces/interface';
import { realpathSync } from 'node:fs';
import type { TiddlyWiki } from 'tiddlywiki';
import { resolveFolderTiddlerStoragePath, scanFolderTiddlers } from './folderTiddlerLoader';
import { logForBestEffort, type WorkerLogSink } from './workerLogging';

/**
 * Wrap TiddlyWiki's wiki loader to support configured sub-wikis without
 * loading any physical root twice.
 */
export function createLoadWikiTiddlersWithSubWikis(
  wikiInstance: ReturnType<typeof TiddlyWiki>,
  homePath: string,
  subWikis: IWikiWorkspace[],
  logContext: LogContext,
  nativeLogger: WorkerLogSink,
) {
  const originalLoadWikiTiddlers = wikiInstance.loadWikiTiddlers.bind(wikiInstance);
  const loadedStorageRoots = new Set<string>();

  const loadFolderRoot = (folderPath: string): void => {
    const canonicalFolderPath = realpathSync(folderPath);
    const storagePath = resolveFolderTiddlerStoragePath(canonicalFolderPath);
    if (loadedStorageRoots.has(storagePath)) return;
    loadedStorageRoots.add(storagePath);

    const scan = scanFolderTiddlers(wikiInstance, canonicalFolderPath, {
      onProgress: ({ durationBucket, scannedFileCount, stage }) => {
        void logForBestEffort(
          nativeLogger,
          logContext,
          'debug',
          `Folder tiddler scan ${stage}: #${scannedFileCount}${durationBucket === undefined ? '' : ` (${durationBucket})`}`,
        );
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
      `Loaded ${scan.files.length} tiddler files from bounded folder storage`,
    );
  };

  return function loadWikiTiddlersWithSubWikis(
    wikiPath: string,
    loadOptions?: { parentPaths?: string[]; readOnly?: boolean },
  ) {
    const wikiInfo = originalLoadWikiTiddlers(wikiPath, loadOptions);
    // Stock includeWikis recursion also enters this wrapper. Register every
    // successfully loaded physical wiki root so the same directory cannot be
    // scanned again through TidGi's configured sub-wiki list.
    if (wikiInfo !== null) loadedStorageRoots.add(resolveFolderTiddlerStoragePath(wikiPath));

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
