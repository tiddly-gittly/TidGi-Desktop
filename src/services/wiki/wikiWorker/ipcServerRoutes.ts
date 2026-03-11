/**
 * Expose apis that ipc sync adaptor will use
 */

import fs from 'fs-extra';
import omit from 'lodash/omit';
import path from 'path';
import { Observable, Subject } from 'rxjs';
import type { ITiddlerFields, ITiddlyWiki } from 'tiddlywiki';

/**
 * Change info emitted by TidGi's change Observable.
 * Includes a revision (changeCount) for echo prevention.
 */
export interface ITidGiChangedTiddlerMeta {
  deleted?: boolean;
  modified?: boolean;
  /** The tiddler's changeCount at the time this change was emitted */
  revision: number;
}
export type ITidGiChangedTiddlers = Record<string, ITidGiChangedTiddlerMeta>;

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
  /** List of sub-wiki paths for file searching */
  private subWikiPaths: string[] = [];

  /**
   * Single shared Subject that all getWikiChangeObserver subscribers connect to.
   * This avoids registering multiple addEventListener('change') listeners, which
   * caused ipcPendingTitles to be consumed by one listener and missed by others
   * (cross-window sync bug).
   */
  private changeSubject: Subject<ITidGiChangedTiddlers> | undefined;
  private changeListenerInstalled = false;

  setConfig({ readOnlyMode }: { readOnlyMode?: boolean }) {
    this.#readonlyMode = Boolean(readOnlyMode);
  }

  setSubWikiPaths(subWikiPaths: string[]) {
    this.subWikiPaths = subWikiPaths;
  }

  /**
   * Fallback wiki home path used when `$tw.boot.wikiPath` is undefined.
   * This happens for simplified wikis that have no `tiddlywiki.info`.
   */
  private homePath: string | undefined;

  setHomePath(homePath: string) {
    this.homePath = homePath;
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
    // When no tiddlywiki.info exists (simplified wiki), $tw.boot.wikiPath is undefined;
    // fall back to the homePath we received at startup.
    const wikiPath = this.wikiInstance.boot.wikiPath ?? this.homePath;
    if (wikiPath === undefined) {
      return { statusCode: 404, headers: { 'Content-Type': 'text/plain' }, data: `$tw.boot.wikiPath and homePath are both undefined.` };
    }

    // Get external attachments folder name from config (default to 'files')
    const externalAttachmentsFolder = this.wikiInstance.wiki.getTiddlerText('$:/config/ExternalAttachments/WikiFolderToMove', 'files');

    // Try main wiki first
    const mainResult = await this.tryReadFile(wikiPath, externalAttachmentsFolder, suppliedFilename);
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
  /**
   * Install a single change listener on the wiki instance if not done yet.
   * Broadcasts ALL changes to the shared Subject (no ipcPendingTitles filtering).
   * Echo prevention is handled by each frontend subscriber via lastSavedRevisions.
   */
  private installChangeListener(): void {
    if (this.changeListenerInstalled || this.wikiInstance === undefined) return;
    this.changeListenerInstalled = true;

    this.wikiInstance.wiki.addEventListener('change', (changes) => {
      const enrichedChanges: ITidGiChangedTiddlers = {};
      let hasChanges = false;

      for (const title in changes) {
        enrichedChanges[title] = {
          ...changes[title],
          revision: this.wikiInstance.wiki.getChangeCount(title),
        };
        hasChanges = true;
      }

      if (hasChanges) {
        this.changeSubject!.next(enrichedChanges);
      }
    });
  }

  getWikiChangeObserver() {
    if (this.changeSubject === undefined) {
      this.changeSubject = new Subject<ITidGiChangedTiddlers>();
    }
    const subject = this.changeSubject;
    return new Observable<ITidGiChangedTiddlers>((observer) => {
      const getWikiChangeObserverInWorkerIIFE = async () => {
        await this.waitForIpcServerRoutesAvailable();
        if (this.wikiInstance === undefined) {
          observer.error(new Error(`this.wikiInstance is undefined, maybe something went wrong between waitForIpcServerRoutesAvailable and return new Observable.`));
          return;
        }
        this.installChangeListener();
        // Forward subject events to this subscriber
        const subscription = subject.subscribe(observer);
        // Log SSE ready every time a new observer subscribes (including after worker restart)
        const timestamp = new Date().toISOString();
        console.debug(`[test-id-SSE_READY] Wiki change observer registered and ready at ${timestamp}`);
        // Return cleanup (rxjs Observable teardown)
        return () => {
          subscription.unsubscribe();
        };
      };
      void getWikiChangeObserverInWorkerIIFE();
    });
  }
}

export const ipcServerRoutes: IpcServerRoutes = new IpcServerRoutes();

// Explicit method signature to preserve types
type IpcServerRoutesMethodsType = {
  deleteTiddler: IpcServerRoutes['deleteTiddler'];
  getFavicon: IpcServerRoutes['getFavicon'];
  getIndex: IpcServerRoutes['getIndex'];
  getStatus: IpcServerRoutes['getStatus'];
  getTiddler: IpcServerRoutes['getTiddler'];
  getTiddlerHtml: IpcServerRoutes['getTiddlerHtml'];
  getTiddlersJSON: IpcServerRoutes['getTiddlersJSON'];
  putTiddler: IpcServerRoutes['putTiddler'];
  getFile: IpcServerRoutes['getFile'];
  getWikiChangeObserver: IpcServerRoutes['getWikiChangeObserver'];
};

export const ipcServerRoutesMethods: IpcServerRoutesMethodsType = {
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
export type IpcServerRouteMethods = Omit<IpcServerRoutesMethodsType, 'getWikiChangeObserver'>;
export type IpcServerRouteNames = keyof IpcServerRouteMethods;
