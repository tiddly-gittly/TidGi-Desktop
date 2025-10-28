/**
 * Expose apis that ipc sync adaptor will use
 */

import fs from 'fs-extra';
import omit from 'lodash/omit';
import path from 'path';
import { Observable } from 'rxjs';
import type { IChangedTiddlers, ITiddlerFields, ITiddlyWiki, OutputMimeTypes } from 'tiddlywiki';

export interface IWikiServerStatusObject {
  anonymous: boolean;
  read_only: boolean;
  space: {
    recipe: string;
  };
  tiddlywiki_version: string;
  username: string;
}
export interface IWikiServerRouteResponse {
  data?: string | Buffer | Array<Omit<ITiddlerFields, 'text'>> | IWikiServerStatusObject | ITiddlerFields;
  headers?: Record<string, string>;
  statusCode?: number;
}

export class IpcServerRoutes {
  private wikiInstance!: ITiddlyWiki;
  private readonly pendingIpcServerRoutesRequests: Array<(value: void | PromiseLike<void>) => void> = [];
  #readonlyMode = false;
  /** Store all active SSE change listeners so we can re-register them when wiki restarts */
  private wikiChangeListeners: Array<(changes: IChangedTiddlers) => void> = [];
  /** Promises waiting for SSE to be ready (at least one observer subscribed) */
  private readonly pendingSSEReadyRequests: Array<(value: void | PromiseLike<void>) => void> = [];
  /** Track if SSE has been initialized for current wiki instance */
  private sseReady = false;
  /** Cache change events that occur before SSE is ready */
  private readonly cachedChangeEvents: IChangedTiddlers[] = [];

  setConfig({ readOnlyMode }: { readOnlyMode?: boolean }) {
    this.#readonlyMode = Boolean(readOnlyMode);
  }

  setWikiInstance(wikiInstance: ITiddlyWiki) {
    const hadPreviousInstance = this.wikiInstance !== undefined;
    this.wikiInstance = wikiInstance;
    // Reset SSE ready state when wiki instance changes
    this.sseReady = false;
    // Clear cached events from previous wiki instance
    this.cachedChangeEvents.length = 0;
    this.pendingIpcServerRoutesRequests.forEach((resolve) => {
      resolve();
    });

    // If this is a wiki restart (not first initialization), re-register all SSE listeners
    if (hadPreviousInstance && this.wikiChangeListeners.length > 0) {
      for (const changeListener of this.wikiChangeListeners) {
        this.wikiInstance.wiki.addEventListener('change', changeListener);
      }
      console.log('[test-id-SSE_READY] Wiki change observer re-registered after restart');
    }
  }

  private async waitForIpcServerRoutesAvailable() {
    if (this.wikiInstance !== undefined) {
      return;
    }
    await new Promise<void>((resolve) => {
      this.pendingIpcServerRoutesRequests.push(resolve);
    });
  }

  /**
   * Wait for SSE to be ready (at least one frontend observer has subscribed).
   * This ensures change events won't be lost during wiki initialization.
   */
  async waitForSSEReady(): Promise<void> {
    if (this.sseReady) {
      return;
    }
    await new Promise<void>((resolve) => {
      this.pendingSSEReadyRequests.push(resolve);
    });
  }

  // ████████ ██ ██████  ██████  ██      ██    ██       ██     ██ ███████ ██████
  //    ██    ██ ██   ██ ██   ██ ██       ██  ██        ██     ██ ██      ██   ██
  //    ██    ██ ██   ██ ██   ██ ██        ████   █████ ██  █  ██ █████   ██████
  //    ██    ██ ██   ██ ██   ██ ██         ██          ██ ███ ██ ██      ██   ██
  //    ██    ██ ██████  ██████  ███████    ██           ███ ███  ███████ ██████

  async deleteTiddler(title: string): Promise<IWikiServerRouteResponse> {
    await this.waitForIpcServerRoutesAvailable();
    this.wikiInstance.wiki.deleteTiddler(title);
    return { headers: { 'Content-Type': 'text/plain' }, data: 'OK', statusCode: 204 };
  }

  async getFavicon(): Promise<IWikiServerRouteResponse> {
    await this.waitForIpcServerRoutesAvailable();
    const buffer = this.wikiInstance.wiki.getTiddlerText('$:/favicon.ico', '');
    return { headers: { 'Content-Type': 'image/x-icon; charset=base64' }, data: buffer, statusCode: 200 };
  }

  async getFile(suppliedFilename: string): Promise<IWikiServerRouteResponse> {
    await this.waitForIpcServerRoutesAvailable();
    if (this.wikiInstance.boot.wikiPath === undefined) {
      return { statusCode: 404, headers: { 'Content-Type': 'text/plain' }, data: `$tw.wiki.boot.wikiPath === undefined.` };
    }
    const baseFilename = path.resolve(this.wikiInstance.boot.wikiPath, 'files');
    const filename = path.resolve(baseFilename, suppliedFilename);
    const extension = path.extname(filename);
    if (path.relative(baseFilename, filename).indexOf('..') === 0) {
      return { statusCode: 404, headers: { 'Content-Type': 'text/plain' }, data: `File ${suppliedFilename} not found` };
    } else {
      // Send the file
      try {
        const data = await fs.readFile(filename);

        const type = this.wikiInstance.config.fileExtensionInfo[extension] ? this.wikiInstance.config.fileExtensionInfo[extension].type : 'application/octet-stream';
        return ({ statusCode: 200, headers: { 'Content-Type': type }, data });
      } catch (error) {
        return { statusCode: 404, headers: { 'Content-Type': 'text/plain' }, data: `Error accessing file ${suppliedFilename} with error: ${(error as Error).toString()}` };
      }
    }
  }

  async getIndex(rootTiddler: string): Promise<IWikiServerRouteResponse> {
    await this.waitForIpcServerRoutesAvailable();
    const wikiHTML = this.wikiInstance.wiki.renderTiddler('text/plain', rootTiddler);
    return { statusCode: 200, headers: { 'Content-Type': 'text/html' }, data: wikiHTML };
  }

  async getStatus(userName: string): Promise<IWikiServerRouteResponse> {
    await this.waitForIpcServerRoutesAvailable();
    const data: IWikiServerStatusObject = {
      username: userName,
      anonymous: false,
      read_only: this.#readonlyMode,
      space: {
        recipe: 'default',
      },
      tiddlywiki_version: this.wikiInstance.version,
    };
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, data };
  }

  async getTiddler(title: string): Promise<IWikiServerRouteResponse> {
    await this.waitForIpcServerRoutesAvailable();
    const tiddler = this.wikiInstance.wiki.getTiddler(title);
    if (tiddler === undefined) {
      return { statusCode: 404, headers: { 'Content-Type': 'text/plain' }, data: `Tiddler "${title}" not exist` };
    }

    const tiddlerFields = { ...tiddler.fields };

    // only add revision if it > 0 or exists

    if (this.wikiInstance.wiki.getChangeCount(title)) {
      tiddlerFields.revision = String(this.wikiInstance.wiki.getChangeCount(title));
    }
    tiddlerFields.bag = 'default';
    tiddlerFields.type = tiddlerFields.type ?? 'text/vnd.tiddlywiki';
    return { statusCode: 200, headers: { 'Content-Type': 'application/json; charset=utf8' }, data: tiddlerFields as ITiddlerFields };
  }

  async getTiddlersJSON(
    filter = '[all[tiddlers]!is[system]sort[title]]',
    excludeFields = ['text'],
    options?: { ignoreSyncSystemConfig?: boolean; toTiddler?: boolean },
  ): Promise<IWikiServerRouteResponse> {
    await this.waitForIpcServerRoutesAvailable();
    if (!(options?.ignoreSyncSystemConfig === true) && this.wikiInstance.wiki.getTiddlerText('$:/config/SyncSystemTiddlersFromServer') !== 'yes') {
      filter += '+[!is[system]]';
    }
    const titles = this.wikiInstance.wiki.filterTiddlers(filter);
    const tiddlers: Array<Omit<ITiddlerFields, 'text'>> = options?.toTiddler === false
      ? titles.map(title => ({ title }))
      : titles.map(title => {
        const tiddler = this.wikiInstance.wiki.getTiddler(title);
        if (tiddler === undefined) {
          return tiddler;
        }
        const tiddlerFields = omit(tiddler.fields, excludeFields) as Record<string, string | number>;
        // only add revision if it > 0 or exists

        if (this.wikiInstance.wiki.getChangeCount(title)) {
          tiddlerFields.revision = String(this.wikiInstance.wiki.getChangeCount(title));
        }
        tiddlerFields.type = tiddlerFields.type ?? 'text/vnd.tiddlywiki';
        return tiddlerFields as Omit<ITiddlerFields, 'text'>;
      })
        .filter((item): item is Omit<ITiddlerFields, 'text'> => item !== undefined);
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, data: tiddlers };
  }

  async putTiddler(title: string, fields: ITiddlerFields): Promise<IWikiServerRouteResponse> {
    await this.waitForIpcServerRoutesAvailable();
    const tiddlerFieldsToPut = omit(fields, ['fields', 'revision', '_is_skinny']) as Record<string, string | number>;
    // Pull up any subfields in the `fields` object
    // we skip this part by not creating the fields object at the beginning at src\services\wiki\plugin\ipcSyncAdaptor\index.ts
    // if ('fields' in fields) {
    //   tiddlerFieldsToPut = {
    //     ...fields.fields as Record<string, string | number>,
    //   };
    // }
    // tiddlerFieldsToPut = {
    //   ...tiddlerFieldsToPut,
    //   // Remove any revision field
    //   ...omit(fields, ['fields', 'revision', '_is_skinny']) as Record<string, string | number>,
    // };
    // If this is a skinny tiddler, it means the client never got the full
    // version of the tiddler to edit. So we must preserve whatever text
    // already exists on the server, or else we'll inadvertently delete it.
    if (fields._is_skinny !== undefined) {
      const tiddler = this.wikiInstance.wiki.getTiddler(title);
      if (tiddler !== undefined) {
        tiddlerFieldsToPut.text = tiddler.fields.text;
      }
    }
    tiddlerFieldsToPut.title = title;
    this.wikiInstance.wiki.addTiddler(new this.wikiInstance.Tiddler(tiddlerFieldsToPut));
    const changeCount = this.wikiInstance.wiki.getChangeCount(title).toString();
    return { statusCode: 204, headers: { 'Content-Type': 'text/plain', Etag: `"default/${encodeURIComponent(title)}/${changeCount}:"` }, data: 'OK' };
  }

  async getTiddlerHtml(title: string): Promise<IWikiServerRouteResponse> {
    await this.waitForIpcServerRoutesAvailable();
    const tiddler = this.wikiInstance.wiki.getTiddler(title);
    if (tiddler === undefined) {
      return { statusCode: 404, headers: { 'Content-Type': 'text/plain' }, data: `Tiddler "${title}" not exist` };
    } else {
      let renderType: OutputMimeTypes = tiddler.getFieldString('_render_type') as OutputMimeTypes;
      let renderTemplate: string = tiddler.getFieldString('_render_template');
      // Tiddler fields '_render_type' and '_render_template' overwrite
      // system wide settings for render type and template
      if (this.wikiInstance.wiki.isSystemTiddler(title)) {
        renderType = renderType ?? /* this.wikiInstance.server.get('system-tiddler-render-type') ?? */ 'text/plain';
        renderTemplate = renderTemplate ?? /* this.wikiInstance.server.get('system-tiddler-render-template') ?? */ '$:/core/templates/wikified-tiddler';
      } else {
        renderType = renderType ?? /* this.wikiInstance.server.get('tiddler-render-type') ?? */ 'text/html';
        renderTemplate = renderTemplate ?? /* this.wikiInstance.server.get('tiddler-render-template') ?? */ '$:/core/templates/server/static.tiddler.html';
      }
      const text = this.wikiInstance.wiki.renderTiddler(renderType, renderTemplate, { parseAsInline: true, variables: { currentTiddler: title } });

      // Naughty not to set a content-type, but it's the easiest way to ensure the browser will see HTML pages as HTML, and accept plain text tiddlers as CSS or JS
      return { statusCode: 200, headers: { 'Content-Type': '; charset=utf8' }, data: text };
    }
  }

  // ████████ ██     ██       ███████ ███████ ███████
  //    ██    ██     ██       ██      ██      ██
  //    ██    ██  █  ██ █████ ███████ ███████ █████
  //    ██    ██ ███ ██            ██      ██ ██
  //    ██     ███ ███        ███████ ███████ ███████
  getWikiChangeObserver() {
    return new Observable<IChangedTiddlers>((observer) => {
      const changeListener = (changes: IChangedTiddlers) => {
        // If SSE is not ready yet, cache the event
        if (!this.sseReady) {
          this.cachedChangeEvents.push(changes);
          return;
        }

        observer.next(changes);
      };

      const setupListener = async () => {
        await this.waitForIpcServerRoutesAvailable();
        if (this.wikiInstance === undefined) {
          observer.error(new Error(`this.wikiInstance is undefined, maybe something went wrong between waitForIpcServerRoutesAvailable and return new Observable.`));
          return;
        }

        this.wikiInstance.wiki.addEventListener('change', changeListener);
        // Store the listener so it can be re-registered on wiki restart
        this.wikiChangeListeners.push(changeListener);
        console.log('[test-id-SSE_READY] Wiki change observer registered and ready');

        // Mark SSE as ready and notify any waiting processes
        if (!this.sseReady) {
          this.sseReady = true;
          this.pendingSSEReadyRequests.forEach((resolve) => {
            resolve();
          });
          this.pendingSSEReadyRequests.length = 0;

          // Send all cached events to the observer
          if (this.cachedChangeEvents.length > 0) {
            for (const cachedEvent of this.cachedChangeEvents) {
              observer.next(cachedEvent);
            }
            this.cachedChangeEvents.length = 0;
          }
        }
      };

      void setupListener();

      // Cleanup on unsubscribe
      return () => {
        // Remove listener from wiki if it exists
        if (this.wikiInstance?.wiki) {
          this.wikiInstance.wiki.removeEventListener('change', changeListener);
        }
        // Remove from stored listeners
        const index = this.wikiChangeListeners.indexOf(changeListener);
        if (index > -1) {
          this.wikiChangeListeners.splice(index, 1);
        }
      };
    });
  }
}

export const ipcServerRoutes: IpcServerRoutes = new IpcServerRoutes();
export const ipcServerRoutesMethods = {
  deleteTiddler: ipcServerRoutes.deleteTiddler.bind(ipcServerRoutes),
  getFavicon: ipcServerRoutes.getFavicon.bind(ipcServerRoutes),
  getIndex: ipcServerRoutes.getIndex.bind(ipcServerRoutes),
  getStatus: ipcServerRoutes.getStatus.bind(ipcServerRoutes),
  getTiddler: ipcServerRoutes.getTiddler.bind(ipcServerRoutes),
  getTiddlerHtml: ipcServerRoutes.getTiddlerHtml.bind(ipcServerRoutes),
  getTiddlersJSON: ipcServerRoutes.getTiddlersJSON.bind(ipcServerRoutes),
  putTiddler: ipcServerRoutes.putTiddler.bind(ipcServerRoutes),
  getFile: ipcServerRoutes.getFile.bind(ipcServerRoutes),
  getWikiChangeObserver: ipcServerRoutes.getWikiChangeObserver.bind(ipcServerRoutes),
};

/**
 * Available methods for ipcServerRoutes exposed from wiki worker
 */
export type IpcServerRouteMethods = Omit<typeof ipcServerRoutesMethods, 'getWikiChangeObserver'>;
export type IpcServerRouteNames = keyof IpcServerRouteMethods;
