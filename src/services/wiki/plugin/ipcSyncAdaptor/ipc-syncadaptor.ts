/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable unicorn/no-null */
import type { IWikiServerStatusObject } from '@services/wiki/wikiWorker/ipcServerRoutes';
import type { WindowMeta, WindowNames } from '@services/windows/WindowProperties';
import debounce from 'lodash/debounce';
import type { IChangedTiddlers, ITiddlerFields, Logger, Syncer, Tiddler, Wiki } from 'tiddlywiki';

type ISyncAdaptorGetStatusCallback = (error: Error | null, isLoggedIn?: boolean, username?: string, isReadOnly?: boolean, isAnonymous?: boolean) => void;
type ISyncAdaptorGetTiddlersJSONCallback = (error: Error | null, tiddler?: Array<Omit<ITiddlerFields, 'text'>>) => void;
type ISyncAdaptorPutTiddlersCallback = (error: Error | null | string, etag?: {
  bag: string;
}, version?: string) => void;
type ISyncAdaptorLoadTiddlerCallback = (error: Error | null, tiddler?: ITiddlerFields) => void;
type ISyncAdaptorDeleteTiddlerCallback = (error: Error | null, adaptorInfo?: { bag?: string } | null) => void;

class TidGiIPCSyncAdaptor {
  name = 'tidgi-ipc';
  supportsLazyLoading = true;
  wiki: Wiki;
  hasStatus: boolean;
  logger: Logger;
  isLoggedIn: boolean;
  isAnonymous: boolean;
  isReadOnly: boolean;
  logoutIsAvailable: boolean;
  wikiService: typeof window.service.wiki;
  workspaceService: typeof window.service.workspace;
  authService: typeof window.service.auth;
  workspaceID: string;
  recipe?: string;

  constructor(options: { wiki: Wiki }) {
    this.wiki = options.wiki;
    this.wikiService = window.service.wiki;
    this.workspaceService = window.service.workspace;
    this.authService = window.service.auth;
    this.hasStatus = false;
    this.isAnonymous = false;
    this.logger = new $tw.utils.Logger('TidGiIPCSyncAdaptor');
    this.isLoggedIn = false;
    this.isReadOnly = false;
    this.logoutIsAvailable = true;
    this.workspaceID = (window.meta as WindowMeta[WindowNames.view]).workspaceID!;
    if (window.observables?.wiki?.getWikiChangeObserver$ !== undefined) {
      // if install-electron-ipc-cat is faster than us, just subscribe to the observable. Otherwise we normally will wait for it to call us here.
      this.setupSSE();
    }
  }

  /**
   * This should be called after install-electron-ipc-cat, so this is called in `$:/plugins/linonetwo/tidgi-ipc-syncadaptor/Startup/install-electron-ipc-cat.js`
   */
  setupSSE() {
    if (window.observables?.wiki?.getWikiChangeObserver$ === undefined) {
      console.error("getWikiChangeObserver$ is undefined in window.observables.wiki, can't subscribe to server changes.");
      return;
    }
    const debouncedSync = debounce(() => {
      if ($tw.syncer === undefined) {
        console.error('Syncer is undefined in TidGiIPCSyncAdaptor. Abort the `syncFromServer` in `setupSSE debouncedSync`.');
        return;
      }
      $tw.syncer.syncFromServer();
      this.clearUpdatedTiddlers();
    }, 500);
    this.logger.log('setupSSE');

    // After SSE is enabled, we can disable polling and else things that related to syncer. (build up complexer behavior with syncer.)
    this.configSyncer();

    window.observables?.wiki?.getWikiChangeObserver$(this.workspaceID).subscribe((change: IChangedTiddlers) => {
      // `$tw.syncer.syncFromServer` calling `this.getUpdatedTiddlers`, so we need to update `this.updatedTiddlers` before it do so. See `core/modules/syncer.js` in the core
      Object.keys(change).forEach(title => {
        if (!change[title]) {
          return;
        }
        if (change[title].deleted && !this.recentUpdatedTiddlersFromClient.deletions.includes(title)) {
          this.updatedTiddlers.deletions.push(title);
        } else if (change[title].modified && !this.recentUpdatedTiddlersFromClient.modifications.includes(title)) {
          this.updatedTiddlers.modifications.push(title);
        }
      });
      debouncedSync();
    });
  }

  updatedTiddlers: { deletions: string[]; modifications: string[] } = {
    // use $:/StoryList to trigger a initial sync, otherwise it won't do lazy load for Index tiddler after init, don't know why, maybe because we disabled the polling by changing pollTimerInterval.
    modifications: [],
    deletions: [],
  };

  /**
   * We will get echo from the server, for these tiddler changes caused by the client, we remove them from the `updatedTiddlers` so that the client won't get them again from server, which will usually get outdated tiddler (lack 1 or 2 words that user just typed).
   */
  recentUpdatedTiddlersFromClient: { deletions: string[]; modifications: string[] } = {
    modifications: [],
    deletions: [],
  };

  /**
   * Add a title as lock to prevent sse echo back. This will auto clear the lock after 2s (this number still needs testing).
   * And it only clear one title after 2s, so if you add the same title rapidly, it will prevent sse echo after 2s of last operation, which can prevent last echo, which is what we want.
   */
  addRecentUpdatedTiddlersFromClient(type: 'modifications' | 'deletions', title: string) {
    this.recentUpdatedTiddlersFromClient[type].push(title);
    setTimeout(() => {
      const index = this.recentUpdatedTiddlersFromClient[type].indexOf(title);
      if (index !== -1) {
        this.recentUpdatedTiddlersFromClient[type].splice(index, 1);
      }
    }, 2000);
  }

  clearUpdatedTiddlers() {
    this.updatedTiddlers = {
      modifications: [],
      deletions: [],
    };
  }

  private configSyncer() {
    if ($tw.syncer === undefined) {
      console.error('Syncer is undefined in TidGiIPCSyncAdaptor. Abort the configSyncer.');
      return;
    }
    $tw.syncer.pollTimerInterval = 2_147_483_647;
  }

  getUpdatedTiddlers(_syncer: Syncer, callback: (error: Error | null | undefined, changes: { deletions: string[]; modifications: string[] }) => void): void {
    this.logger.log('getUpdatedTiddlers');
    callback(null, this.updatedTiddlers);
  }

  setLoggerSaveBuffer(loggerForSaving: Logger) {
    this.logger.setSaveBuffer(loggerForSaving);
  }

  isReady() {
    // We ipc sync adaptor is always ready to work! (Otherwise this will be false for first lazy-load event.) Seems first lazy load happened before the first status ipc call returns.
    return true;
  }

  getTiddlerInfo(tiddler: Tiddler) {
    return {
      bag: tiddler.fields.bag,
    };
  }

  getTiddlerRevision(title: string) {
    const tiddler = this.wiki.getTiddler(title);
    return tiddler?.fields?.revision;
  }

  /*
  Get the current status of the TiddlyWeb connection
  */
  async getStatus(callback?: ISyncAdaptorGetStatusCallback) {
    this.logger.log('Getting status');
    try {
      const workspace = await this.workspaceService.get(this.workspaceID);
      const userName = workspace === undefined ? '' : await this.authService.getUserName(workspace);
      const statusResponse = await this.wikiService.callWikiIpcServerRoute(this.workspaceID, 'getStatus', userName);
      const status = statusResponse?.data as IWikiServerStatusObject;
      if (status === undefined) {
        throw new Error('No status returned from callWikiIpcServerRoute getStatus');
      }
      this.hasStatus = true;
      // Record the recipe
      this.recipe = status.space?.recipe;
      // Check if we're logged in
      this.isLoggedIn = status.username !== 'GUEST';
      this.isReadOnly = !!status.read_only;
      this.isAnonymous = !!status.anonymous;
      // this.logoutIsAvailable = 'logout_is_available' in status ? !!status.logout_is_available : true;

      callback?.(null, this.isLoggedIn, status.username, this.isReadOnly, this.isAnonymous);
    } catch (error) {
      // eslint-disable-next-line n/no-callback-literal
      callback?.(error as Error);
    }
  }

  /*
  Get an array of skinny tiddler fields from the server
  */
  async getSkinnyTiddlers(callback: ISyncAdaptorGetTiddlersJSONCallback) {
    try {
      this.logger.log('getSkinnyTiddlers');
      const tiddlersJSONResponse = await this.wikiService.callWikiIpcServerRoute(
        this.workspaceID,
        'getTiddlersJSON',
        '[all[tiddlers]] -[[$:/isEncrypted]] -[prefix[$:/temp/]] -[prefix[$:/status/]] -[[$:/boot/boot.js]] -[[$:/boot/bootprefix.js]] -[[$:/library/sjcl.js]] -[[$:/core]]',
      );

      // Process the tiddlers to make sure the revision is a string
      const skinnyTiddlers = tiddlersJSONResponse?.data as Array<Omit<ITiddlerFields, 'text'>> | undefined;
      if (skinnyTiddlers === undefined) {
        throw new Error('No tiddlers returned from callWikiIpcServerRoute getTiddlersJSON in getSkinnyTiddlers');
      }
      this.logger.log('skinnyTiddlers.length', skinnyTiddlers.length);
      // Invoke the callback with the skinny tiddlers
      callback(null, skinnyTiddlers);
    } catch (error) {
      // eslint-disable-next-line n/no-callback-literal
      callback?.(error as Error);
    }
  }

  /*
  Save a tiddler and invoke the callback with (err,adaptorInfo,revision)
  */
  async saveTiddler(tiddler: Tiddler, callback: ISyncAdaptorPutTiddlersCallback, _options?: unknown) {
    if (this.isReadOnly) {
      callback(null);
      return;
    }
    try {
      const title = tiddler.fields.title;
      this.logger.log(`loadTiddler ${title}`);
      this.addRecentUpdatedTiddlersFromClient('modifications', title);
      const putTiddlerResponse = await this.wikiService.callWikiIpcServerRoute(
        this.workspaceID,
        'putTiddler',
        title,
        tiddler.fields,
      );
      if (putTiddlerResponse === undefined) {
        throw new Error('saveTiddler returned undefined from callWikiIpcServerRoute putTiddler in saveTiddler');
      }
      // Save the details of the new revision of the tiddler
      const etag = putTiddlerResponse?.headers?.Etag;
      if (etag === undefined) {
        callback(new Error('Response from server is missing required `etag` header'));
      } else {
        const etagInfo = this.parseEtag(etag);
        if (etagInfo !== undefined) {
          // Invoke the callback
          callback(null, {
            bag: etagInfo.bag,
          }, etagInfo.revision);
        }
      }
    } catch (error) {
      // eslint-disable-next-line n/no-callback-literal
      callback?.(error as Error);
    }
  }

  /*
  Load a tiddler and invoke the callback with (err,tiddlerFields)
  */
  async loadTiddler(title: string, callback?: ISyncAdaptorLoadTiddlerCallback) {
    this.logger.log(`loadTiddler ${title}`);
    try {
      const getTiddlerResponse = await this.wikiService.callWikiIpcServerRoute(
        this.workspaceID,
        'getTiddler',
        title,
      );
      if (getTiddlerResponse?.data === undefined) {
        throw new Error('getTiddler returned undefined from callWikiIpcServerRoute getTiddler in loadTiddler');
      }
      callback?.(null, getTiddlerResponse.data as ITiddlerFields);
    } catch (error) {
      // eslint-disable-next-line n/no-callback-literal
      callback?.(error as Error);
    }
  }

  /*
  Delete a tiddler and invoke the callback with (err)
  options include:
  tiddlerInfo: the syncer's tiddlerInfo for this tiddler
  */
  async deleteTiddler(title: string, callback: ISyncAdaptorDeleteTiddlerCallback, options: { tiddlerInfo: { adaptorInfo: { bag?: string } } }) {
    if (this.isReadOnly) {
      callback(null);
      return;
    }
    // If we don't have a bag it means that the tiddler hasn't been seen by the server, so we don't need to delete it
    const bag = options?.tiddlerInfo?.adaptorInfo?.bag;
    this.logger.log('deleteTiddler', bag);
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!bag) {
      callback(null, options.tiddlerInfo.adaptorInfo);
      return;
    }
    this.addRecentUpdatedTiddlersFromClient('deletions', title);
    const getTiddlerResponse = await this.wikiService.callWikiIpcServerRoute(
      this.workspaceID,
      'deleteTiddler',
      title,
    );
    try {
      if (getTiddlerResponse?.data === undefined) {
        throw new Error('getTiddler returned undefined from callWikiIpcServerRoute getTiddler in loadTiddler');
      }
      // Invoke the callback & return null adaptorInfo
      callback(null, null);
    } catch (error) {
      // eslint-disable-next-line n/no-callback-literal
      callback?.(error as Error);
    }
  }

  /*
  Split a TiddlyWeb Etag into its constituent parts. For example:

  ```
  "system-images_public/unsyncedIcon/946151:9f11c278ccde3a3149f339f4a1db80dd4369fc04"
  ```

  Note that the value includes the opening and closing double quotes.

  The parts are:

  ```
  <bag>/<title>/<revision>:<hash>
  ```
  */
  parseEtag(etag: string) {
    const firstSlash = etag.indexOf('/');
    const lastSlash = etag.lastIndexOf('/');
    const colon = etag.lastIndexOf(':');
    if (!(firstSlash === -1 || lastSlash === -1 || colon === -1)) {
      return {
        bag: $tw.utils.decodeURIComponentSafe(etag.substring(1, firstSlash)),
        title: $tw.utils.decodeURIComponentSafe(etag.substring(firstSlash + 1, lastSlash)),
        revision: etag.substring(lastSlash + 1, colon),
      };
    }
  }
}

if ($tw.browser && typeof window !== 'undefined') {
  const isInTidGi = typeof document !== 'undefined' && document?.location?.protocol?.startsWith('tidgi');
  const servicesExposed = Boolean(window.service?.wiki);
  const hasWorkspaceIDinMeta = Boolean((window.meta as WindowMeta[WindowNames.view] | undefined)?.workspaceID);
  if (isInTidGi && servicesExposed && hasWorkspaceIDinMeta) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    exports.adaptorClass = TidGiIPCSyncAdaptor;
  }
}
