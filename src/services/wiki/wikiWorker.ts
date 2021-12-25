import 'source-map-support/register';
import { expose } from 'threads/worker';
import path from 'path';
import tiddlywiki, { I$TW } from '@tiddlygit/tiddlywiki';
import { Observable } from 'rxjs';
import intercept from 'intercept-stdout';
import { Server } from 'http';

import { IWikiMessage, WikiControlActions } from './interface';
import { defaultServerIP } from '@/constants/urls';

let wikiInstance: I$TW | undefined;

function startNodeJSWiki({
  homePath,
  tiddlyWikiHost = defaultServerIP,
  tiddlyWikiPort = 5112,
  userName,
}: {
  homePath: string;
  tiddlyWikiHost: string;
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
        observer.next({ type: 'control', source: 'intercept', actions: WikiControlActions.error, message: newStdError });
      },
    );

    try {
      wikiInstance = tiddlywiki.TiddlyWiki();
      process.env.TIDDLYWIKI_PLUGIN_PATH = path.resolve(homePath, 'plugins');
      process.env.TIDDLYWIKI_THEME_PATH = path.resolve(homePath, 'themes');
      // add tiddly filesystem back https://github.com/Jermolene/TiddlyWiki5/issues/4484#issuecomment-596779416
      wikiInstance.boot.argv = [
        '+plugins/tiddlywiki/filesystem',
        '+plugins/tiddlywiki/tiddlyweb',
        // '+plugins/linonetwo/watch-fs',
        homePath,
        '--listen',
        `anon-username=${userName}`,
        `port=${tiddlyWikiPort}`,
        `host=${tiddlyWikiHost}`,
        'root-tiddler=$:/core/save/lazy-images',
      ];
      wikiInstance.hooks.addHook('th-server-command-post-start', function (listenCommand, server: Server) {
        server.on('error', function (error) {
          observer.next({ type: 'control', actions: WikiControlActions.error, message: error.message });
        });
        server.on('listening', function () {
          observer.next({
            type: 'control',
            actions: WikiControlActions.booted,
            message: `Tiddlywiki booted at http://${tiddlyWikiHost}:${tiddlyWikiPort} (webview uri ip may be different, being getLocalHostUrlWithActualIP()) with args ${
              wikiInstance !== undefined ? wikiInstance.boot.argv.join(' ') : '(wikiInstance is undefined)'
            }`,
          });
        });
      });
      wikiInstance.boot.startup({});
    } catch (error) {
      const message = `Tiddlywiki booted failed with error ${(error as Error).message} ${(error as Error).stack ?? ''}`;
      observer.next({ type: 'control', source: 'try catch', actions: WikiControlActions.error, message });
    }
  });
}

const wikiWorker = { startNodeJSWiki, getTiddlerFileMetadata: (tiddlerTitle: string) => wikiInstance?.boot?.files?.[tiddlerTitle] };
export type WikiWorker = typeof wikiWorker;
expose(wikiWorker);
