import type { SyncAdaptor, Wiki } from 'tiddlywiki';

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
const CONFIG_HOST_TIDDLER = '$:/config/tiddlyweb/host';
const DEFAULT_HOST_TIDDLER = '$protocol$//$host$/';

class TidGiIPCSyncAdaptor implements SyncAdaptor {
  name = 'tidgi-ipc';
  supportsLazyLoading = true;
  wiki: Wiki
hasStatus: boolean
logger
isLoggedIn
isReadOnly
logoutIsAvailable

  constructor(options) {
    this.wiki = options.wiki;
    this.host = this.getHost();
    this.hasStatus = false;
    this.logger = new $tw.utils.Logger('TidGiIPCSyncAdaptor');
    this.isLoggedIn = false;
    this.isReadOnly = false;
    this.logoutIsAvailable = true;
  }

  setLoggerSaveBuffer(loggerForSaving) {
    this.logger.setSaveBuffer(loggerForSaving);
  }

  isReady() {
    return this.hasStatus;
  }

  getHost() {
    let text = this.wiki.getTiddlerText(CONFIG_HOST_TIDDLER, DEFAULT_HOST_TIDDLER);
    const substitutions = [
      { name: 'protocol', value: document.location.protocol },
      { name: 'host', value: document.location.host },
    ];
    for (const s of substitutions) {
      text = $tw.utils.replaceString(text, new RegExp('\\$' + s.name + '\\$', 'mg'), s.value);
    }
    return text;
  }

  getTiddlerInfo(tiddler) {
    return {
      bag: tiddler.fields.bag,
    };
  }

  getTiddlerRevision(title) {
    const tiddler = this.wiki.getTiddler(title);
    return tiddler.fields.revision;
  }

  /*
  Get the current status of the TiddlyWeb connection
  */
  getStatus(callback) {
    // Get status
    const self = this;
    this.logger.log('Getting status');
    $tw.utils.httpRequest({
      url: this.host + 'status',
      callback: function(error, data) {
        self.hasStatus = true;
        if (error) {
          return callback(error);
        }
        // If Browser-Storage plugin is present, cache pre-loaded tiddlers and add back after sync from server completes
        if ($tw.browserStorage && $tw.browserStorage.isEnabled()) {
          $tw.browserStorage.cachePreloadTiddlers();
        }
        // Decode the status JSON
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {}
        if (json) {
          self.logger.log('Status:', data);
          // Record the recipe
          if (json.space) {
            self.recipe = json.space.recipe;
          }
          // Check if we're logged in
          self.isLoggedIn = json.username !== 'GUEST';
          self.isReadOnly = !!json.read_only;
          self.isAnonymous = !!json.anonymous;
          self.logoutIsAvailable = 'logout_is_available' in json ? !!json.logout_is_available : true;
        }
        // Invoke the callback if present
        if (callback) {
          callback(null, self.isLoggedIn, json.username, self.isReadOnly, self.isAnonymous);
        }
      },
    });
  }

  /*
  Attempt to login and invoke the callback(err)
  */
  login(username, password, callback) {
    const options = {
      url: this.host + 'challenge/tiddlywebplugins.tiddlyspace.cookie_form',
      type: 'POST',
      data: {
        user: username,
        password,
        tiddlyweb_redirect: '/status', // workaround to marginalize automatic subsequent GET
      },
      callback: function(error) {
        callback(error);
      },
      headers: {
        accept: 'application/json',
        'X-Requested-With': 'TiddlyWiki',
      },
    };
    this.logger.log('Logging in:', options);
    $tw.utils.httpRequest(options);
  }

  /*
  */
  logout(callback) {
    if (this.logoutIsAvailable) {
      const options = {
        url: this.host + 'logout',
        type: 'POST',
        data: {
          csrf_token: this.getCsrfToken(),
          tiddlyweb_redirect: '/status', // workaround to marginalize automatic subsequent GET
        },
        callback: function(error, data, xhr) {
          callback(error);
        },
        headers: {
          accept: 'application/json',
          'X-Requested-With': 'TiddlyWiki',
        },
      };
      this.logger.log('Logging out:', options);
      $tw.utils.httpRequest(options);
    } else {
      alert('This server does not support logging out. If you are using basic authentication the only way to logout is close all browser windows');
      callback(null);
    }
  }

  /*
  Retrieve the CSRF token from its cookie
  */
  getCsrfToken() {
    const regex = /^(?:.*; )?csrf_token=([^$();|]*)(?:;|$)/;
    const match = regex.exec(document.cookie);
    let csrf = null;
    if ((match != undefined) && (match.length === 2)) {
      csrf = match[1];
    }
    return csrf;
  }

  /*
  Get an array of skinny tiddler fields from the server
  */
  getSkinnyTiddlers(callback) {
    const self = this;
    $tw.utils.httpRequest({
      url: this.host + 'recipes/' + this.recipe + '/tiddlers.json',
      data: {
        filter:
          '[all[tiddlers]] -[[$:/isEncrypted]] -[prefix[$:/temp/]] -[prefix[$:/status/]] -[[$:/boot/boot.js]] -[[$:/boot/bootprefix.js]] -[[$:/library/sjcl.js]] -[[$:/core]]',
      },
      callback: function(error, data) {
        // Check for errors
        if (error) {
          return callback(error);
        }
        // Process the tiddlers to make sure the revision is a string
        const tiddlers = JSON.parse(data);
        for (let t = 0; t < tiddlers.length; t++) {
          tiddlers[t] = self.convertTiddlerFromTiddlyWebFormat(tiddlers[t]);
        }
        // Invoke the callback with the skinny tiddlers
        callback(null, tiddlers);
        // If Browswer Storage tiddlers were cached on reloading the wiki, add them after sync from server completes in the above callback.
        if ($tw.browserStorage && $tw.browserStorage.isEnabled()) {
          $tw.browserStorage.addCachedTiddlers();
        }
      },
    });
  }

  /*
  Save a tiddler and invoke the callback with (err,adaptorInfo,revision)
  */
  saveTiddler(tiddler, callback, options) {
    const self = this;
    if (this.isReadOnly) {
      return callback(null);
    }
    $tw.utils.httpRequest({
      url: this.host + 'recipes/' + encodeURIComponent(this.recipe) + '/tiddlers/' + encodeURIComponent(tiddler.fields.title),
      type: 'PUT',
      headers: {
        'Content-type': 'application/json',
      },
      data: this.convertTiddlerToTiddlyWebFormat(tiddler),
      callback: function(error, data, request) {
        if (error) {
          return callback(error);
        }
        //  If Browser-Storage plugin is present, remove tiddler from local storage after successful sync to the server
        if ($tw.browserStorage && $tw.browserStorage.isEnabled()) {
          $tw.browserStorage.removeTiddlerFromLocalStorage(tiddler.fields.title);
        }
        // Save the details of the new revision of the tiddler
        const etag = request.getResponseHeader('Etag');
        if (etag) {
          const etagInfo = self.parseEtag(etag);
          // Invoke the callback
          callback(null, {
            bag: etagInfo.bag,
          }, etagInfo.revision);
        } else {
          callback('Response from server is missing required `etag` header');
        }
      },
    });
  }

  /*
  Load a tiddler and invoke the callback with (err,tiddlerFields)
  */
  loadTiddler(title, callback) {
    const self = this;
    $tw.utils.httpRequest({
      url: this.host + 'recipes/' + encodeURIComponent(this.recipe) + '/tiddlers/' + encodeURIComponent(title),
      callback: function(error, data, request) {
        if (error) {
          return callback(error);
        }
        // Invoke the callback
        callback(null, self.convertTiddlerFromTiddlyWebFormat(JSON.parse(data)));
      },
    });
  }

  /*
  Delete a tiddler and invoke the callback with (err)
  options include:
  tiddlerInfo: the syncer's tiddlerInfo for this tiddler
  */
  deleteTiddler(title, callback, options) {
    const self = this;
    if (this.isReadOnly) {
      return callback(null);
    }
    // If we don't have a bag it means that the tiddler hasn't been seen by the server, so we don't need to delete it
    const bag = options.tiddlerInfo.adaptorInfo && options.tiddlerInfo.adaptorInfo.bag;
    if (!bag) {
      return callback(null, options.tiddlerInfo.adaptorInfo);
    }
    // Issue HTTP request to delete the tiddler
    $tw.utils.httpRequest({
      url: this.host + 'bags/' + encodeURIComponent(bag) + '/tiddlers/' + encodeURIComponent(title),
      type: 'DELETE',
      callback: function(error, data, request) {
        if (error) {
          return callback(error);
        }
        // Invoke the callback & return null adaptorInfo
        callback(null, null);
      },
    });
  }

  /*
  Convert a tiddler to a field set suitable for PUTting to TiddlyWeb
  */
  convertTiddlerToTiddlyWebFormat(tiddler) {
    const result = {};
    const knownFields = new Set([
      'bag',
      'created',
      'creator',
      'modified',
      'modifier',
      'permissions',
      'recipe',
      'revision',
      'tags',
      'text',
      'title',
      'type',
      'uri',
    ]);
    if (tiddler) {
      $tw.utils.each(tiddler.fields, (fieldValue, fieldName) => {
        const fieldString = fieldName === 'tags'
          ? tiddler.fields.tags
          : tiddler.getFieldString(fieldName); // Tags must be passed as an array, not a string

        if (knownFields.has(fieldName)) {
          // If it's a known field, just copy it across
          result[fieldName] = fieldString;
        } else {
          // If it's unknown, put it in the "fields" field
          result.fields = result.fields || {};
          result.fields[fieldName] = fieldString;
        }
      });
    }
    // Default the content type
    result.type = result.type || 'text/vnd.tiddlywiki';
    return JSON.stringify(result, null, $tw.config.preferences.jsonSpaces);
  }

  /*
  Convert a field set in TiddlyWeb format into ordinary TiddlyWiki5 format
  */
  convertTiddlerFromTiddlyWebFormat(tiddlerFields) {
    const self = this;
    const result = {};
    // Transfer the fields, pulling down the `fields` hashmap
    $tw.utils.each(tiddlerFields, (element, title, object) => {
      if (title === 'fields') {
        $tw.utils.each(element, (element, subTitle, object) => {
          result[subTitle] = element;
        });
      } else {
        result[title] = tiddlerFields[title];
      }
    });
    // Make sure the revision is expressed as a string
    if (typeof result.revision === 'number') {
      result.revision = result.revision.toString();
    }
    // Some unholy freaking of content types
    if (result.type === 'text/javascript') {
      result.type = 'application/javascript';
    } else if (!result.type || result.type === 'None') {
      result.type = 'text/x-tiddlywiki';
    }
    return result;
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
  parseEtag(etag) {
    const firstSlash = etag.indexOf('/');
    const lastSlash = etag.lastIndexOf('/');
    const colon = etag.lastIndexOf(':');
    if (firstSlash === -1 || lastSlash === -1 || colon === -1) {
      return null;
    } else {
      return {
        bag: $tw.utils.decodeURIComponentSafe(etag.substring(1, firstSlash)),
        title: $tw.utils.decodeURIComponentSafe(etag.substring(firstSlash + 1, lastSlash)),
        revision: etag.substring(lastSlash + 1, colon),
      };
    }
  }
}

if (($tw.browser) && document.location.protocol.startsWith('tidgi')) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  exports.adaptorClass = TidGiIPCSyncAdaptor;
}
