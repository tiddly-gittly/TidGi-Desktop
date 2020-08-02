import { cloneDeep, merge } from 'lodash';

// CONFIGS
const defaultOptions = {
  debug: false,
  loadPath: '/locales/{{lng}}/{{ns}}.json', // Where the translation files get loaded from
  addPath: '/locales/{{lng}}/{{ns}}.missing.json', // Where the missing translation files get generated
};

const readFileRequest = 'ReadFile-Request';
const writeFileRequest = 'WriteFile-Request';
const readFileResponse = 'ReadFile-Response';
const writeFileResponse = 'WriteFile-Response';
const changeLanguageRequest = 'ChangeLanguage-Request';

/**
 * Fast UUID generator, RFC4122 version 4 compliant.
 * @author Jeff Ward (jcward.com).
 * @license MIT license
 * @link http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript/21963136#21963136
 **/
const UUID = (function() {
  const self = {};
  const lut = [];
  for (let i = 0; i < 256; i++) {
    lut[i] = (i < 16 ? '0' : '') + i.toString(16);
  }
  self.generate = function() {
    const d0 = (Math.random() * 0xffffffff) | 0;
    const d1 = (Math.random() * 0xffffffff) | 0;
    const d2 = (Math.random() * 0xffffffff) | 0;
    const d3 = (Math.random() * 0xffffffff) | 0;
    return `${lut[d0 & 0xff] + lut[(d0 >> 8) & 0xff] + lut[(d0 >> 16) & 0xff] + lut[(d0 >> 24) & 0xff]}-${
      lut[d1 & 0xff]
    }${lut[(d1 >> 8) & 0xff]}-${lut[((d1 >> 16) & 0x0f) | 0x40]}${lut[(d1 >> 24) & 0xff]}-${lut[(d2 & 0x3f) | 0x80]}${
      lut[(d2 >> 8) & 0xff]
    }-${lut[(d2 >> 16) & 0xff]}${lut[(d2 >> 24) & 0xff]}${lut[d3 & 0xff]}${lut[(d3 >> 8) & 0xff]}${
      lut[(d3 >> 16) & 0xff]
    }${lut[(d3 >> 24) & 0xff]}`;
  };
  return self;
})();

// Merges objects together
const mergeNested = function(object, path, split, value) {
  const tokens = path.split(split);
  let temporary = {};
  let temporary2;
  temporary[`${tokens[tokens.length - 1]}`] = value;
  for (let i = tokens.length - 2; i >= 0; i--) {
    temporary2 = {};
    temporary2[`${tokens[i]}`] = temporary;
    temporary = temporary2;
  }
  return merge(object, temporary);
};

// https://stackoverflow.com/a/34890276/1837080
const groupByArray = function(xs, key) {
  return xs.reduce(function(rv, x) {
    const v = key instanceof Function ? key(x) : x[key];
    const element = rv.find(r => r && r.key === v);
    if (element) {
      element.values.push(x);
    } else {
      rv.push({
        key: v,
        values: [x],
      });
    }
    return rv;
  }, []);
};

// Template is found at: https://www.i18next.com/misc/creating-own-plugins#backend;
// also took code from: https://github.com/i18next/i18next-node-fs-backend
class Backend {
  constructor(services, backendOptions = {}, i18nextOptions = {}) {
    this.init(services, backendOptions, i18nextOptions);

    this.readCallbacks = {}; // Callbacks after reading a translation
    this.writeCallbacks = {}; // Callbacks after writing a missing translation
    this.writeTimeout; // A timer that will initate writing missing translations to files
    this.writeQueue = []; // An array to hold missing translations before the writeTimeout occurs
    this.writeQueueOverflow = []; // An array to hold missing translations while the writeTimeout's items are being written to file
    this.useOverflow = false; // If true, we should insert missing translations into the writeQueueOverflow
  }

  init(services, backendOptions, i18nextOptions) {
    if (typeof window !== 'undefined' && typeof window.i18n.i18nextElectronBackend === 'undefined') {
      throw new Error(
        "'window.i18n.i18nextElectronBackend' is not defined! Be sure you are setting up your BrowserWindow's preload script properly!",
      );
    }

    this.services = services;
    this.backendOptions = {
      ...defaultOptions,
      ...backendOptions,
      i18nextElectronBackend: typeof window !== 'undefined' ? window.i18n.i18nextElectronBackend : undefined,
    };
    this.i18nextOptions = i18nextOptions;

    // log-related
    const logPrepend = '[i18next-electron-fs-backend:';
    this.mainLog = `${logPrepend}main]=>`;
    this.rendererLog = `${logPrepend}renderer]=>`;

    this.setupIpcBindings();
  }

  // Sets up Ipc bindings so that we can keep any node-specific
  // modules; (ie. 'fs') out of the Electron renderer process
  setupIpcBindings() {
    const { i18nextElectronBackend } = this.backendOptions;

    i18nextElectronBackend.onReceive(readFileResponse, arguments_ => {
      // args:
      // {
      //   key
      //   error
      //   data
      // }

      // Don't know why we need this line;
      // upon initialization, the i18next library
      // ends up in this .on([channel], args) method twice
      if (typeof this.readCallbacks[arguments_.key] === 'undefined') return;

      let callback;

      if (arguments_.error) {
        // Failed to read translation file;
        // we pass back a fake "success" response
        // so that we create a translation file
        callback = this.readCallbacks[arguments_.key].callback;
        delete this.readCallbacks[arguments_.key];
        if (callback !== null && typeof callback === 'function') callback(null, {});
      } else {
        let result;
        arguments_.data = arguments_.data.replace(/^\uFEFF/, '');
        try {
          result = JSON.parse(arguments_.data);
        } catch (parseError) {
          parseError.message = `Error parsing '${arguments_.filename}'. Message: '${parseError}'.`;
          callback = this.readCallbacks[arguments_.key].callback;
          delete this.readCallbacks[arguments_.key];
          if (callback !== null && typeof callback === 'function') callback(parseError);
          return;
        }
        callback = this.readCallbacks[arguments_.key].callback;
        delete this.readCallbacks[arguments_.key];
        if (callback !== null && typeof callback === 'function') callback(null, result);
      }
    });

    i18nextElectronBackend.onReceive(writeFileResponse, arguments_ => {
      // args:
      // {
      //   keys
      //   error
      // }

      const { keys } = arguments_;
      for (const key of keys) {
        let callback;

        // Write methods don't have any callbacks from what I've seen,
        // so this is called more than I thought; but necessary!
        if (typeof this.writeCallbacks[key] === 'undefined') return;

        if (arguments_.error) {
          callback = this.writeCallbacks[key].callback;
          delete this.writeCallbacks[key];
          callback(arguments_.error);
        } else {
          callback = this.writeCallbacks[key].callback;
          delete this.writeCallbacks[key];
          callback(null, true);
        }
      }
    });
  }

  // Writes a given translation to file
  write(writeQueue) {
    const { debug, i18nextElectronBackend } = this.backendOptions;

    // Group by filename so we can make one request
    // for all changes within a given file
    const toWork = groupByArray(writeQueue, 'filename');

    for (const element of toWork) {
      const anonymous = function(error, data) {
        if (error) {
          console.error(
            `${this.rendererLog} encountered error when trying to read file '${filename}' before writing missing translation ('${key}'/'${fallbackValue}') to file. Please resolve this error so missing translation values can be written to file. Error: '${error}'.`,
          );
          return;
        }

        const keySeparator = !!this.i18nextOptions.keySeparator; // Do we have a key separator or not?
        const writeKeys = [];

        for (let j = 0; j < element.values.length; j++) {
          // If we have no key separator set, simply update the translation value
          if (!keySeparator) {
            data[element.values[j].key] = element.values[j].fallbackValue;
          } else {
            // Created the nested object structure based on the key separator, and merge that
            // into the existing translation data
            data = mergeNested(
              data,
              element.values[j].key,
              this.i18nextOptions.keySeparator,
              element.values[j].fallbackValue,
            );
          }

          const writeKey = `${UUID.generate()}`;
          if (element.values[j].callback) {
            this.writeCallbacks[writeKey] = {
              callback: element.values[j].callback,
            };
            writeKeys.push(writeKey);
          }
        }

        // Send out the message to the ipcMain process
        debug
          ? console.log(`${this.rendererLog} requesting the missing key '${key}' be written to file '${filename}'.`)
          : null;
        i18nextElectronBackend.send(writeFileRequest, {
          keys: writeKeys,
          filename: element.key,
          data,
        });
      }.bind(this);
      this.requestFileRead(element.key, anonymous);
    }
  }

  // Reads a given translation file
  requestFileRead(filename, callback) {
    const { i18nextElectronBackend } = this.backendOptions;

    // Save the callback for this request so we
    // can execute once the ipcRender process returns
    // with a value from the ipcMain process
    const key = `${UUID.generate()}`;
    this.readCallbacks[key] = {
      callback,
    };

    // Send out the message to the ipcMain process
    i18nextElectronBackend.send(readFileRequest, {
      key,
      filename,
    });
  }

  // Reads a given translation file
  read(language, namespace, callback) {
    const { loadPath } = this.backendOptions;
    const filename = this.services.interpolator.interpolate(loadPath, {
      lng: language,
      ns: namespace,
    });

    this.requestFileRead(filename, (error, data) => {
      if (error) return callback(error, false); // no retry
      callback(null, data);
    });
  }

  // Not implementing at this time
  readMulti(languages, namespaces, callback) {
    throw 'Not implemented exception.';
  }

  // Writes a missing translation to file
  create(languages, namespace, key, fallbackValue, callback) {
    const { addPath } = this.backendOptions;
    let filename;
    languages = typeof languages === 'string' ? [languages] : languages;

    // Create the missing translation for all languages
    for (const language of languages) {
      filename = this.services.interpolator.interpolate(addPath, {
        lng: language,
        ns: namespace,
      });

      // If we are currently writing missing translations from writeQueue,
      // temporarily store the requests in writeQueueOverflow until we are
      // done writing to file
      if (this.useOverflow) {
        this.writeQueueOverflow.push({
          filename,
          key,
          fallbackValue,
          callback,
        });
      } else {
        this.writeQueue.push({
          filename,
          key,
          fallbackValue,
          callback,
        });
      }
    }

    // Fire up the timeout to process items to write
    if (this.writeQueue.length > 0 && !this.useOverflow) {
      // Clear out any existing timeout if we are still getting translations to write
      if (typeof this.writeTimeout !== 'undefined') {
        clearInterval(this.writeTimeout);
      }

      this.writeTimeout = setInterval(
        function() {
          // Write writeQueue entries, then after,
          // fill in any from the writeQueueOverflow
          if (this.writeQueue.length > 0) {
            this.write(cloneDeep(this.writeQueue));
          }
          this.writeQueue = cloneDeep(this.writeQueueOverflow);
          this.writeQueueOverflow = [];

          if (this.writeQueue.length === 0) {
            // Clear timer
            clearInterval(this.writeTimeout);
            delete this.writeTimeout;
            this.useOverflow = false;
          }
        }.bind(this),
        1000,
      );
      this.useOverflow = true;
    }
  }
}
Backend.type = 'backend';

export default Backend;
