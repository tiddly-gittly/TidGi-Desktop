import 'source-map-support/register';
import { expose } from 'threads/worker';
import path from 'path';
import tiddlywiki from '@tiddlygit/tiddlywiki';
import { Observable } from 'rxjs';
import intercept from 'intercept-stdout';

import { IWikiMessage, WikiControlActions } from './interface';
import { defaultServerIP } from '@/constants/urls';

function startNodeJSWiki({
  homePath,
  tiddlyWikiPort = 5112,
  userName,
}: {
  homePath: string;
  tiddlyWikiPort: number;
  userName: string;
}): Observable<IWikiMessage> {
  return new Observable<IWikiMessage>((observer) => {
    observer.next({ type: 'control', actions: WikiControlActions.start });
    intercept(
      (newStdOut: string) => {
        observer.next({ type: 'stdout', message: newStdOut });
      },
      (newStdError: string) => {
        observer.next({ type: 'stderr', message: newStdError });
      },
    );

    const wikiInstance = tiddlywiki.TiddlyWiki();
    try {
      process.env.TIDDLYWIKI_PLUGIN_PATH = path.resolve(homePath, 'plugins');
      process.env.TIDDLYWIKI_THEME_PATH = path.resolve(homePath, 'themes');
      // add tiddly filesystem back https://github.com/Jermolene/TiddlyWiki5/issues/4484#issuecomment-596779416
      wikiInstance.boot.argv = [
        '+plugins/tiddlywiki/filesystem',
        '+plugins/tiddlywiki/tiddlyweb',
        '+plugins/linonetwo/watch-fs',
        homePath,
        '--listen',
        `anon-username=${userName}`,
        `port=${tiddlyWikiPort}`,
        `host=${defaultServerIP}`,
        'root-tiddler=$:/core/save/lazy-images',
      ];
      wikiInstance.boot.startup({
        callback: () =>
          observer.next({ type: 'control', actions: WikiControlActions.booted, message: `Tiddlywiki booted at http://localhost:${tiddlyWikiPort}` }),
      });
    } catch (error) {
      const message = `Tiddlywiki booted failed with error ${(error as Error).message} ${(error as Error).stack ?? ''}`;
      observer.next({ type: 'control', actions: WikiControlActions.error, message });
      throw new Error(message);
    }
  });
}

const wikiWorker = { startNodeJSWiki };
export type WikiWorker = typeof wikiWorker;
expose(wikiWorker);
