import { expose } from 'threads/worker';
import path from 'path';
import tiddlywiki from '@tiddlygit/tiddlywiki';
import intercept from 'intercept-stdout';

import { wikiOutputToFile, refreshOutputFile } from '@services/libs/log/wiki-output';

async function startNodeJSWiki({ homePath, tiddlyWikiPort = 5112, userName }: { homePath: string; tiddlyWikiPort: number; userName: string }): Promise<string> {
  refreshOutputFile(homePath);
  intercept(
    (newStdOut: string) => {
      wikiOutputToFile(homePath, newStdOut);
    },
    (newStdError: string) => {
      wikiOutputToFile(homePath, newStdError);
    },
  );

  const $tw = tiddlywiki.TiddlyWiki();
  try {
    process.env.TIDDLYWIKI_PLUGIN_PATH = path.resolve(homePath, 'plugins');
    process.env.TIDDLYWIKI_THEME_PATH = path.resolve(homePath, 'themes');
    // add tiddly filesystem back https://github.com/Jermolene/TiddlyWiki5/issues/4484#issuecomment-596779416
    $tw.boot.argv = [
      '+plugins/tiddlywiki/filesystem',
      '+plugins/tiddlywiki/tiddlyweb',
      '+plugins/linonetwo/watch-fs',
      homePath,
      '--listen',
      `anon-username=${userName}`,
      `port=${tiddlyWikiPort}`,
      'host=0.0.0.0',
      'root-tiddler=$:/core/save/lazy-images',
    ];
    return await new Promise((resolve, reject) => {
      $tw.boot.startup({ callback: () => resolve(`Tiddlywiki booted at http://localhost:${tiddlyWikiPort}`) });
    });
  } catch (error) {
    throw new Error(`Tiddlywiki booted failed with error ${(error as Error).message} ${(error as Error).stack ?? ''}`);
  }
}
expose({ startNodeJSWiki });
