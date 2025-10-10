import { isHtmlWiki } from '@/constants/fileNames';
import { remove } from 'fs-extra';
import { TiddlyWiki } from 'tiddlywiki';

export async function extractWikiHTML(htmlWikiPath: string, saveWikiFolderPath: string, constants: { TIDDLYWIKI_PACKAGE_FOLDER: string }): Promise<void> {
  // tiddlywiki --load ./mywiki.html --savewikifolder ./mywikifolder
  // --savewikifolder <wikifolderpath> [<filter>]
  // . /mywikifolder is the path where the tiddlder and plugins folders are stored
  const { TIDDLYWIKI_PACKAGE_FOLDER } = constants;
  try {
    const wikiInstance = TiddlyWiki();
    wikiInstance.boot.argv = ['--load', htmlWikiPath, '--savewikifolder', saveWikiFolderPath, 'explodePlugins=no'];
    await new Promise<void>((resolve, reject) => {
      try {
        wikiInstance.boot.startup({
          // passing bootPath inside TidGi app. fix The "path" argument must be of type string. Received undefined
          bootPath: TIDDLYWIKI_PACKAGE_FOLDER,
          callback: () => {
            resolve();
          },
        });
      } catch (_error: unknown) {
        const error = _error instanceof Error ? _error : new Error(String(_error));
        reject(error);
      }
    });
  } catch (_error: unknown) {
    // removes the folder function that failed to convert.
    await remove(saveWikiFolderPath);
    const error = _error instanceof Error ? _error : new Error(String(_error));
    throw error;
  }
}

export async function packetHTMLFromWikiFolder(folderWikiPath: string, pathOfNewHTML: string, constants: { TIDDLYWIKI_PACKAGE_FOLDER: string }): Promise<void> {
  // tiddlywiki ./mywikifolder --rendertiddler '$:/core/save/all' mywiki.html text/plain
  // . /mywikifolder is the path to the wiki folder, which generally contains the tiddlder and plugins directories
  const { TIDDLYWIKI_PACKAGE_FOLDER } = constants;
  const wikiInstance = TiddlyWiki();
  // a .html file path should be provided, but if provided a folder path, we can add /index.html to fix it.
  wikiInstance.boot.argv = [folderWikiPath, '--rendertiddler', '$:/core/save/all', isHtmlWiki(pathOfNewHTML) ? pathOfNewHTML : `${pathOfNewHTML}/index.html`, 'text/plain'];
  await new Promise<void>((resolve, reject) => {
    try {
      wikiInstance.boot.startup({
        // passing bootPath inside TidGi app. fix The "path" argument must be of type string. Received undefined
        bootPath: TIDDLYWIKI_PACKAGE_FOLDER,
        callback: () => {
          resolve();
        },
      });
    } catch (_error: unknown) {
      const error = _error instanceof Error ? _error : new Error(String(_error));
      reject(error);
    }
  });
}
