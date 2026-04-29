import { isHtmlWiki } from '@/constants/fileNames';
import { remove } from 'fs-extra';
import path from 'path';

/**
 * Dynamically load the TiddlyWiki module from wiki-local installation if available,
 * otherwise fall back to the built-in version shipped with TidGi.
 * This must be dynamic because the static `import { TiddlyWiki } from 'tiddlywiki'`
 * always resolves to the built-in version at module load time, ignoring local installations.
 */
function loadTiddlyWikiModule(TIDDLY_WIKI_BOOT_PATH: string) {
  // TIDDLY_WIKI_BOOT_PATH points to ".../node_modules/tiddlywiki/boot"
  // Go up one level to get the package root
  const tiddlyWikiPackagePath = path.resolve(TIDDLY_WIKI_BOOT_PATH, '..');
  try {
    return require(tiddlyWikiPackagePath) as typeof import('tiddlywiki');
  } catch {
    // If loading from local path fails, fall back to built-in
    return require('tiddlywiki') as typeof import('tiddlywiki');
  }
}

export async function extractWikiHTML(htmlWikiPath: string, saveWikiFolderPath: string, constants: { TIDDLY_WIKI_BOOT_PATH: string }): Promise<void> {
  // tiddlywiki --load ./mywiki.html --savewikifolder ./mywikifolder
  // --savewikifolder <wikifolderpath> [<filter>]
  // . /mywikifolder is the path where the tiddlder and plugins folders are stored
  const { TIDDLY_WIKI_BOOT_PATH } = constants;
  try {
    const { TiddlyWiki } = loadTiddlyWikiModule(TIDDLY_WIKI_BOOT_PATH);
    const wikiInstance = TiddlyWiki();
    wikiInstance.boot.argv = ['--load', htmlWikiPath, '--savewikifolder', saveWikiFolderPath, 'explodePlugins=no'];
    await new Promise<void>((resolve, reject) => {
      try {
        wikiInstance.boot.startup({
          // passing bootPath inside TidGi app. fix The "path" argument must be of type string. Received undefined
          bootPath: TIDDLY_WIKI_BOOT_PATH,
          callback: () => {
            resolve();
          },
        });
      } catch (error_: unknown) {
        const error = error_ as Error;
        reject(error);
      }
    });
  } catch (error_: unknown) {
    // removes the folder function that failed to convert.
    await remove(saveWikiFolderPath);
    const error = error_ as Error;
    throw error;
  }
}

export async function packetHTMLFromWikiFolder(folderWikiPath: string, pathOfNewHTML: string, constants: { TIDDLY_WIKI_BOOT_PATH: string }): Promise<void> {
  // tiddlywiki ./mywikifolder --rendertiddler '$:/core/save/all' mywiki.html text/plain
  // . /mywikifolder is the path to the wiki folder, which generally contains the tiddlder and plugins directories
  const { TIDDLY_WIKI_BOOT_PATH } = constants;
  const { TiddlyWiki } = loadTiddlyWikiModule(TIDDLY_WIKI_BOOT_PATH);
  const wikiInstance = TiddlyWiki();
  // a .html file path should be provided, but if provided a folder path, we can add /index.html to fix it.
  wikiInstance.boot.argv = [folderWikiPath, '--rendertiddler', '$:/core/save/all', isHtmlWiki(pathOfNewHTML) ? pathOfNewHTML : `${pathOfNewHTML}/index.html`, 'text/plain'];
  await new Promise<void>((resolve, reject) => {
    try {
      wikiInstance.boot.startup({
        // passing bootPath inside TidGi app. fix The "path" argument must be of type string. Received undefined
        bootPath: TIDDLY_WIKI_BOOT_PATH,
        callback: () => {
          resolve();
        },
      });
    } catch (error_: unknown) {
      const error = error_ as Error;
      reject(error);
    }
  });
}
