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
  /** Track tiddlers that were just saved via IPC to prevent echo */
  private readonly recentlySavedTiddlers = new Set<string>();
  /** List of sub-wiki paths for file searching */
  private subWikiPaths: string[] = [];

  setConfig({ readOnlyMode }: { readOnlyMode?: boolean }) {
    this.#readonlyMode = Boolean(readOnlyMode);
  }

  setSubWikiPaths(subWikiPaths: string[]) {
    this.subWikiPaths = subWikiPaths;
  }

  setWikiInstance(wikiInstance: ITiddlyWiki) {
    this.wikiInstance = wikiInstance;
    this.pendingIpcServerRoutesRequests.forEach((resolve) => {
      resolve();
    });
  }

  private async waitForIpcServerRoutesAvailable() {
    if (this.wikiInstance !== undefined) {
      return;
    }
    await new Promise<void>((resolve) => {
      this.pendingIpcServerRoutesRequests.push(resolve);
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

  /**
   * Try to read file from a specific wiki folder
   * @param wikiPath - Wiki folder path
   * @param externalAttachmentsFolder - External attachments folder name (e.g., 'files')
   * @param suppliedFilename - Requested filename
   * @returns File data and mime type, or null if not found or invalid path
   */
  private async tryReadFile(
    wikiPath: string,
    externalAttachmentsFolder: string,
    suppliedFilename: string,
  ): Promise<{ data: Buffer; type: string } | null> {
    const baseFilename = path.resolve(wikiPath, externalAttachmentsFolder);
    const filename = path.resolve(baseFilename, suppliedFilename);
    const extension = path.extname(filename);

    // Security check: prevent path traversal
    if (!(filename === baseFilename || filename.startsWith(baseFilename + path.sep))) {
      return null;
    }

    try {
      const data = await fs.readFile(filename);
      const type = this.wikiInstance.config.fileExtensionInfo[extension]?.type ?? 'application/octet-stream';
      return { data, type };
    } catch {
      return null;
    }
  }

  /**
   * Get file from files/ folder (configured by `$:/config/ExternalAttachments/WikiFolderToMove`) and sub-wiki's files folder.
   */
  async getFile(suppliedFilename: string): Promise<IWikiServerRouteResponse> {
    await this.waitForIpcServerRoutesAvailable();
    if (this.wikiInstance.boot.wikiPath === undefined) {
      return { statusCode: 404, headers: { 'Content-Type': 'text/plain' }, data: `$tw.wiki.boot.wikiPath === undefined.` };
    }

    // Get external attachments folder name from config (default to 'files')
    const externalAttachmentsFolder = this.wikiInstance.wiki.getTiddlerText('$:/config/ExternalAttachments/WikiFolderToMove', 'files');

    // Try main wiki first
    const mainResult = await this.tryReadFile(this.wikiInstance.boot.wikiPath, externalAttachmentsFolder, suppliedFilename);
    if (mainResult !== null) {
      return { statusCode: 200, headers: { 'Content-Type': mainResult.type }, data: mainResult.data };
    }

    // Try sub-wikis
    for (const subWikiPath of this.subWikiPaths) {
      const subResult = await this.tryReadFile(subWikiPath, externalAttachmentsFolder, suppliedFilename);
      if (subResult !== null) {
        return { statusCode: 200, headers: { 'Content-Type': subResult.type }, data: subResult.data };
      }
    }

    // File not found in any wiki
    return { statusCode: 404, headers: { 'Content-Type': 'text/plain' }, data: `File ${suppliedFilename} not found` };
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

    // Mark this tiddler as recently saved to prevent echo
    this.recentlySavedTiddlers.add(title);

    this.wikiInstance.wiki.addTiddler(new this.wikiInstance.Tiddler(tiddlerFieldsToPut));

    // Note: The change event is triggered synchronously by addTiddler
    // The event handler in getWikiChangeObserver$ will check recentlySavedTiddlers
    // and remove the mark after filtering

    const changeCount = this.wikiInstance.wiki.getChangeCount(title).toString();
    return { statusCode: 204, headers: { 'Content-Type': 'text/plain', Etag: `"default/${encodeURIComponent(title)}/${changeCount}:"` }, data: 'OK' };
  }

  async getTiddlerHtml(title: string): Promise<IWikiServerRouteResponse> {
    await this.waitForIpcServerRoutesAvailable();
    const tiddler = this.wikiInstance.wiki.getTiddler(title);
    if (tiddler === undefined) {
      return { statusCode: 404, headers: { 'Content-Type': 'text/plain' }, data: `Tiddler "${title}" not exist` };
    } else {
      // Render tiddler content to plain text (wikitext will be converted to readable text)
      // This is simpler and more reliable than using HTML templates
      const text = this.wikiInstance.wiki.renderTiddler('text/plain', title, { parseAsInline: false });

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
      const getWikiChangeObserverInWorkerIIFE = async () => {
        await this.waitForIpcServerRoutesAvailable();
        if (this.wikiInstance === undefined) {
          observer.error(new Error(`this.wikiInstance is undefined, maybe something went wrong between waitForIpcServerRoutesAvailable and return new Observable.`));
        }
        this.wikiInstance.wiki.addEventListener('change', (changes) => {
          // Filter out tiddlers that were just saved via IPC to prevent echo
          const filteredChanges: IChangedTiddlers = {};
          let hasChanges = false;

          for (const title in changes) {
            if (this.recentlySavedTiddlers.has(title)) {
              // This change was caused by our own putTiddler, skip it to prevent echo
              this.recentlySavedTiddlers.delete(title);
              continue;
            }
            filteredChanges[title] = changes[title];
            hasChanges = true;
          }

          // Only notify if there are actual changes after filtering
          if (hasChanges) {
            observer.next(filteredChanges);
          }
        });
        // Log SSE ready every time a new observer subscribes (including after worker restart)
        // Include timestamp to make each log entry unique for test detection
        const timestamp = new Date().toISOString();
        console.debug(`[test-id-SSE_READY] Wiki change observer registered and ready at ${timestamp}`);
      };
      void getWikiChangeObserverInWorkerIIFE();
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
