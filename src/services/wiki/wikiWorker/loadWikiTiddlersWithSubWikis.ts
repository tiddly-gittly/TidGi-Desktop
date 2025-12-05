import type { IWikiWorkspace } from '@services/workspaces/interface';
import path from 'path';
import type { TiddlyWiki } from 'tiddlywiki';

/**
 * Factory function to create a custom loadWikiTiddlers function that loads sub-wiki tiddlers.
 * This ensures sub-wiki tiddlers are loaded into the main wiki's $tw.boot.files
 * and $tw.wiki, making them available alongside main wiki tiddlers.
 *
 * TiddlyWiki's includeWikis mechanism normally requires modifying tiddlywiki.info,
 * but we dynamically inject sub-wikis based on workspace configuration instead.
 * This wraps TiddlyWiki's original loadWikiTiddlers to dynamically inject sub-wiki tiddlers
 * after the main wiki is loaded, without modifying tiddlywiki.info.
 *
 * @param wikiInstance - The TiddlyWiki instance
 * @param homePath - Main wiki home path
 * @param subWikis - Array of sub-wiki workspaces sorted by order (priority)
 * @param workspaceName - Workspace name for logging
 * @param nativeLogger - Logger function
 */
export function createLoadWikiTiddlersWithSubWikis(
  wikiInstance: ReturnType<typeof TiddlyWiki>,
  homePath: string,
  subWikis: IWikiWorkspace[],
  workspaceName: string,
  nativeLogger: {
    logFor: (name: string, level: 'info' | 'error', message: string) => Promise<void>;
  },
) {
  const originalLoadWikiTiddlers = wikiInstance.loadWikiTiddlers.bind(wikiInstance);

  return function loadWikiTiddlersWithSubWikis(
    wikiPath: string,
    options?: { parentPaths?: string[]; readOnly?: boolean },
  ) {
    // Call original function first to load main wiki
    const wikiInfo = originalLoadWikiTiddlers(wikiPath, options);

    // Only inject sub-wikis when loading the main wiki (not when loading included wikis)
    if (wikiPath !== homePath || !wikiInfo || subWikis.length === 0) {
      return wikiInfo;
    }
    for (const subWiki of subWikis) {
      // Sub-wikis store tiddlers directly in their root folder (not in /tiddlers subfolder)
      // Only the main wiki uses /tiddlers because it has other meta files like .github
      const subWikiTiddlersPath = subWiki.wikiFolderLocation;

      try {
        // Load tiddlers from sub-wiki directory
        const tiddlerFiles = wikiInstance.loadTiddlersFromPath(subWikiTiddlersPath);

        for (const tiddlerFile of tiddlerFiles) {
          // Register file info for filesystem adaptor (so tiddlers save back to correct location)
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
          // Add tiddlers to wiki
          wikiInstance.wiki.addTiddlers(tiddlerFile.tiddlers);
        }

        void nativeLogger.logFor(
          workspaceName,
          'info',
          `Loaded sub-wiki tiddlers from: ${subWikiTiddlersPath}`,
        );
      } catch (error) {
        void nativeLogger.logFor(
          workspaceName,
          'error',
          `Failed to load sub-wiki tiddlers from ${subWikiTiddlersPath}: ${(error as Error).message}`,
        );
      }
    }

    return wikiInfo;
  };
}
