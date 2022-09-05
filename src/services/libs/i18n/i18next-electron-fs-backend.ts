/* eslint-disable */
/* eslint-disable unicorn/prevent-abbreviations */
import { BackendModule } from 'i18next';
import { cloneDeep, merge, Object } from 'lodash';
import { I18NChannels } from '@/constants/channels';

// CONFIGS
const defaultOptions = {
  debug: false,
  loadPath: '/locales/{{lng}}/{{ns}}.json',
  addPath: '/locales/{{lng}}/{{ns}}.missing.json',
};

// Merges objects together
function mergeNestedI18NObject<T extends Object<any>>(object: T, path: string, split: string, value: any): T {
  const tokens = path.split(split);
  let temporary: T = {} as T;
  let temporary2: T;
  (temporary as any)[`${tokens[tokens.length - 1]}`] = value;
  for (let index = tokens.length - 2; index >= 0; index--) {
    temporary2 = {} as T;
    (temporary2 as any)[`${tokens[index]}`] = temporary;
    temporary = temporary2;
  }
  return merge(object, temporary);
}
// https://stackoverflow.com/a/34890276/1837080
const groupByArray = function (xs: any, key: any) {
  return xs.reduce(function (rv: any, x: any) {
    const v = key instanceof Function ? key(x) : x[key];
    const element = rv.find((r: any) => r && r.key === v);
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
export class Backend implements BackendModule {
  static type = 'backend';
  type = 'backend' as const;

  backendOptions: any;
  i18nextOptions: any;
  mainLog: any;
  readCallbacks: any;
  rendererLog: any;
  services: any;
  useOverflow: any;
  writeCallbacks: any;
  writeQueue: any;
  writeQueueOverflow: any;
  writeTimeout: any;
  constructor(services: any, backendOptions = {}, i18nextOptions = {}) {
    this.init(services, backendOptions, i18nextOptions);
    this.readCallbacks = {}; // Callbacks after reading a translation
    this.writeCallbacks = {}; // Callbacks after writing a missing translation
    this.writeTimeout; // A timer that will initate writing missing translations to files
    this.writeQueue = []; // An array to hold missing translations before the writeTimeout occurs
    this.writeQueueOverflow = []; // An array to hold missing translations while the writeTimeout's items are being written to file
    this.useOverflow = false; // If true, we should insert missing translations into the writeQueueOverflow
  }

  init(services: any, backendOptions: any, i18nextOptions: any) {
    if (typeof window !== 'undefined' && typeof window.i18n.i18nextElectronBackend === 'undefined') {
      throw new TypeError("'window.i18n.i18nextElectronBackend' is not defined! Be sure you are setting up your BrowserWindow's preload script properly!");
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
    i18nextElectronBackend.onReceive(I18NChannels.readFileResponse, (arguments_: any) => {
      // args:
      // {
      //   key
      //   error
      //   data
      // }
      // Don't know why we need this line;
      // upon initialization, the i18next library
      // ends up in this .on([channel], args) method twice
      if (typeof this.readCallbacks[arguments_.key] === 'undefined') {
        return;
      }
      let callback;
      if (arguments_.error) {
        // Failed to read translation file;
        // we pass back a fake "success" response
        // so that we create a translation file
        callback = this.readCallbacks[arguments_.key].callback;
        delete this.readCallbacks[arguments_.key];
        if (callback !== null && typeof callback === 'function') {
          callback(null, {});
        }
      } else {
        let result;
        arguments_.data = arguments_.data.replace(/^\uFEFF/, '');
        try {
          result = JSON.parse(arguments_.data);
        } catch (parseError) {
          (parseError as Error).message = `Error parsing '${arguments_.filename}'. Message: '${parseError}'.`;
          callback = this.readCallbacks[arguments_.key].callback;
          delete this.readCallbacks[arguments_.key];
          if (callback !== null && typeof callback === 'function') {
            callback(parseError);
          }
          return;
        }
        callback = this.readCallbacks[arguments_.key].callback;
        delete this.readCallbacks[arguments_.key];
        if (callback !== null && typeof callback === 'function') {
          callback(null, result);
        }
      }
    });
    i18nextElectronBackend.onReceive(I18NChannels.writeFileResponse, (arguments_: any) => {
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
        if (typeof this.writeCallbacks[key] === 'undefined') {
          return;
        }
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
  write(writeQueue: any) {
    const { debug, i18nextElectronBackend } = this.backendOptions;
    // Group by filename so we can make one request
    // for all changes within a given file
    const toWork = groupByArray(writeQueue, 'filename');
    for (const element of toWork) {
      const anonymous = (error: any, data: any) => {
        if (error) {
          console.error(
            `${this.rendererLog} encountered error when trying to read file '{filename}' before writing missing translation ('{key}'/'{fallbackValue}') to file. Please resolve this error so missing translation values can be written to file. Error: '${error}'.`,
          );
          return;
        }
        const keySeparator = !!this.i18nextOptions.keySeparator; // Do we have a key separator or not?
        const writeKeys = [];
        for (let index = 0; index < element.values.length; index++) {
          // If we have no key separator set, simply update the translation value
          if (!keySeparator) {
            data[element.values[index].key] = element.values[index].fallbackValue;
          } else {
            // Created the nested object structure based on the key separator, and merge that
            // into the existing translation data
            data = mergeNestedI18NObject(data, element.values[index].key, this.i18nextOptions.keySeparator, element.values[index].fallbackValue);
          }
          const writeKey = String(Math.random());
          if (element.values[index].callback) {
            this.writeCallbacks[writeKey] = {
              callback: element.values[index].callback,
            };
            writeKeys.push(writeKey);
          }
        }
        // Send out the message to the ipcMain process
        debug ? console.log(`${this.rendererLog} requesting the missing key '${String(writeKeys)}' be written to file '${element.key}'.`) : null;
        i18nextElectronBackend.send(I18NChannels.writeFileRequest, {
          keys: writeKeys,
          filename: element.key,
          data,
        });
      };
      this.requestFileRead(element.key, anonymous);
    }
  }

  // Reads a given translation file
  requestFileRead(filename: any, callback: any) {
    const { i18nextElectronBackend } = this.backendOptions;
    // Save the callback for this request so we
    // can execute once the ipcRender process returns
    // with a value from the ipcMain process
    const key = String(Math.random());
    this.readCallbacks[key] = {
      callback,
    };
    // Send out the message to the ipcMain process
    i18nextElectronBackend.send(I18NChannels.readFileRequest, {
      key,
      filename,
    });
  }

  // Reads a given translation file
  read(language: string, namespace: string, callback: any) {
    const { loadPath } = this.backendOptions;
    const filename = this.services.interpolator.interpolate(loadPath, {
      lng: language,
      ns: namespace,
    });
    this.requestFileRead(filename, (error: any, data: any) => {
      if (error) {
        return callback(error, false);
      } // no retry
      callback(null, data);
    });
  }

  // Not implementing at this time
  readMulti(languages: string[], namespaces: any, callback: any) {
    throw 'Not implemented exception.';
  }

  // Writes a missing translation to file
  create(languages: string[], namespace: string, key: string, fallbackValue: string) {
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
        });
      } else {
        this.writeQueue.push({
          filename,
          key,
          fallbackValue,
        });
      }
    }
    // Fire up the timeout to process items to write
    if (this.writeQueue.length > 0 && !this.useOverflow) {
      // Clear out any existing timeout if we are still getting translations to write
      if (typeof this.writeTimeout !== 'undefined') {
        clearInterval(this.writeTimeout);
      }
      this.writeTimeout = setInterval(() => {
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
      }, 1000);
      this.useOverflow = true;
    }
  }
}
