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
    this.setupSSE();
  }

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
    window.observables?.wiki?.getWikiChangeObserver$(this.workspaceID).subscribe((change: IChangedTiddlers) => {
      // `$tw.syncer.syncFromServer` calling `this.getUpdatedTiddlers`, so we need to update `this.updatedTiddlers` before it do so. See `core/modules/syncer.js` in the core
      Object.keys(change).forEach(title => {
        if (!change[title]) {
          return;
        }
        if (change[title].deleted) {
          this.updatedTiddlers.deletions.push(title);
        } else {
          this.updatedTiddlers.modifications.push(title);
        }
      });
      debouncedSync();
    });
  }

  updatedTiddlers: { deletions: string[]; modifications: string[] } = {
    modifications: [],
    deletions: [],
  };

  clearUpdatedTiddlers() {
    this.updatedTiddlers = {
      modifications: [],
      deletions: [],
    };
  }

  getUpdatedTiddlers(_syncer: Syncer, callback: (error: Error | null | undefined, changes: { deletions: string[]; modifications: string[] }) => void): void {
    callback(null, this.updatedTiddlers);
  }

  setLoggerSaveBuffer(loggerForSaving: Logger) {
    this.logger.setSaveBuffer(loggerForSaving);
  }

  isReady() {
    return this.hasStatus;
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
      // If Browser-Storage plugin is present, cache pre-loaded tiddlers and add back after sync from server completes
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
      if (($tw as any).browserStorage?.isEnabled()) {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
        ($tw as any).browserStorage?.cachePreloadTiddlers();
      }

      this.logger.log('Status:', status);
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

  // /*
  // Attempt to login and invoke the callback(err)
  // */
  // login(username, password, callback) {
  //   const options = {
  //     url: this.host + 'challenge/tiddlywebplugins.tiddlyspace.cookie_form',
  //     type: 'POST',
  //     data: {
  //       user: username,
  //       password,
  //       tiddlyweb_redirect: '/status', // workaround to marginalize automatic subsequent GET
  //     },
  //     callback: function(error) {
  //       callback(error);
  //     },
  //     headers: {
  //       accept: 'application/json',
  //       'X-Requested-With': 'TiddlyWiki',
  //     },
  //   };
  //   this.logger.log('Logging in:', options);
  //   $tw.utils.httpRequest(options);
  // }

  // /*
  // */
  // logout(callback) {
  //   if (this.logoutIsAvailable) {
  //     const options = {
  //       url: this.host + 'logout',
  //       type: 'POST',
  //       data: {
  //         csrf_token: this.getCsrfToken(),
  //         tiddlyweb_redirect: '/status', // workaround to marginalize automatic subsequent GET
  //       },
  //       callback: function(error, data, xhr) {
  //         callback(error);
  //       },
  //       headers: {
  //         accept: 'application/json',
  //         'X-Requested-With': 'TiddlyWiki',
  //       },
  //     };
  //     this.logger.log('Logging out:', options);
  //     $tw.utils.httpRequest(options);
  //   } else {
  //     alert('This server does not support logging out. If you are using basic authentication the only way to logout is close all browser windows');
  //     callback(null);
  //   }
  // }

  // /*
  // Retrieve the CSRF token from its cookie
  // */
  // getCsrfToken() {
  //   const regex = /^(?:.*; )?csrf_token=([^$();|]*)(?:;|$)/;
  //   const match = regex.exec(document.cookie);
  //   let csrf = null;
  //   if ((match != undefined) && (match.length === 2)) {
  //     csrf = match[1];
  //   }
  //   return csrf;
  // }

  /*
  Get an array of skinny tiddler fields from the server
  */
  async getSkinnyTiddlers(callback: ISyncAdaptorGetTiddlersJSONCallback) {
    try {
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
      // Invoke the callback with the skinny tiddlers
      callback(null, skinnyTiddlers);
      // If Browswer Storage tiddlers were cached on reloading the wiki, add them after sync from server completes in the above callback.
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
      if (($tw as any).browserStorage && ($tw as any).browserStorage.isEnabled()) {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
        ($tw as any).browserStorage.addCachedTiddlers();
      }
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
      const putTiddlerResponse = await this.wikiService.callWikiIpcServerRoute(
        this.workspaceID,
        'putTiddler',
        tiddler.fields.title,
        tiddler.fields,
      );
      if (putTiddlerResponse === undefined) {
        throw new Error('saveTiddler returned undefined from callWikiIpcServerRoute putTiddler in saveTiddler');
      }
      //  If Browser-Storage plugin is present, remove tiddler from local storage after successful sync to the server
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
      if (($tw as any).browserStorage && ($tw as any).browserStorage.isEnabled()) {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
        ($tw as any).browserStorage.removeTiddlerFromLocalStorage(tiddler.fields.title);
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
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!bag) {
      callback(null, options.tiddlerInfo.adaptorInfo);
      return;
    }
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

  // /*
  // Convert a tiddler to a field set suitable for PUTting to TiddlyWeb
  // */
  // convertTiddlerToTiddlyWebFormat(tiddler: Tiddler) {
  //   const result = {};
  //   const knownFields = new Set([
  //     'bag',
  //     'created',
  //     'creator',
  //     'modified',
  //     'modifier',
  //     'permissions',
  //     'recipe',
  //     'revision',
  //     'tags',
  //     'text',
  //     'title',
  //     'type',
  //     'uri',
  //   ]);
  //   if (tiddler) {
  //     Object.keys(tiddler.fields).forEach((fieldName) => {
  //       const fieldString = fieldName === 'tags'
  //         ? tiddler.fields.tags
  //         : tiddler.getFieldString(fieldName); // Tags must be passed as an array, not a string

  //       if (knownFields.has(fieldName)) {
  //         // If it's a known field, just copy it across
  //         // @ts-expect-error ts-migrate(2339) Property 'fields' does not exist on type '{}'.
  //         result[fieldName] = fieldString;
  //       } else {
  //         // If it's unknown, put it in the "fields" field
  //         // @ts-expect-error ts-migrate(2339) Property 'fields' does not exist on type '{}'.
  //         result.fields = result.fields || {};
  //         // @ts-expect-error ts-migrate(2339) Property 'fields' does not exist on type '{}'.
  //         result.fields[fieldName] = fieldString;
  //       }
  //     });
  //   }
  //   // Default the content type
  //   // @ts-expect-error ts-migrate(2339) Property 'type' does not exist on type '{}'.
  //   result.type = result.type || 'text/vnd.tiddlywiki';
  //   return JSON.stringify(result, null, $tw.config.preferences.jsonSpaces);
  // }

  // /*
  // Convert a field set in TiddlyWeb format into ordinary TiddlyWiki5 format
  // */
  // convertTiddlerFromTiddlyWebFormat(tiddlerFields: IWikiServerTiddlersJSONObject): Tiddler {
  //   const result = {};
  //   // Transfer the fields, pulling down the `fields` hashmap
  //   $tw.utils.each(tiddlerFields, (element, title, object) => {
  //     if (title === 'fields') {
  //       $tw.utils.each(element, (element, subTitle, object) => {
  //         result[subTitle] = element;
  //       });
  //     } else {
  //       result[title] = tiddlerFields[title];
  //     }
  //   });
  //   // Make sure the revision is expressed as a string
  //   if (typeof result.revision === 'number') {
  //     result.revision = result.revision.toString();
  //   }
  //   // Some unholy freaking of content types
  //   if (result.type === 'text/javascript') {
  //     result.type = 'application/javascript';
  //   } else if (!result.type || result.type === 'None') {
  //     result.type = 'text/x-tiddlywiki';
  //   }
  //   return result;
  // }

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

if (typeof $tw !== 'undefined' && $tw.browser && typeof window !== 'undefined') {
  const isInTidGi = typeof document !== 'undefined' && document?.location?.protocol?.startsWith('tidgi');
  const servicesExposed = Boolean(window.service?.wiki);
  const hasWorkspaceIDinMeta = Boolean((window.meta as WindowMeta[WindowNames.view]).workspaceID);
  if (isInTidGi && servicesExposed && hasWorkspaceIDinMeta) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    exports.adaptorClass = TidGiIPCSyncAdaptor;
  }
}
