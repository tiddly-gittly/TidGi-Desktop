import { I18NChannels } from '@/constants/channels';
import type { BackendModule, InitOptions, MultiReadCallback, ReadCallback, Services } from 'i18next';
import { cloneDeep, merge, Object } from 'lodash';

// CONFIGS
const defaultOptions = {
  debug: false,
  loadPath: '/locales/{{lng}}/{{ns}}.json',
  addPath: '/locales/{{lng}}/{{ns}}.missing.json',
};

// Merges objects together
function mergeNestedI18NObject<T extends Record<string, unknown>>(object: T, path: string, split: string, value: unknown): T {
  const tokens = path.split(split);
  let temporary: Record<string, unknown> = { [tokens[tokens.length - 1]]: value };
  for (let index = tokens.length - 2; index >= 0; index--) {
    temporary = { [tokens[index]]: temporary };
  }
  return merge(object, temporary) as T;
}
// Safe interpolate wrapper: avoid using `any` on interpolator and provide a fallback
type InterpolatorLike = { interpolate: (template: string, variables: Record<string, unknown>, options?: unknown, postProcess?: unknown) => string };
function hasInterpolate(x: unknown): x is InterpolatorLike {
  return !!x && typeof (x as InterpolatorLike).interpolate === 'function';
}
function safeInterpolate(interpolator: unknown, template: string, variables: { [k: string]: unknown }): string {
  if (hasInterpolate(interpolator)) {
    try {
      return interpolator.interpolate(template, variables);
    } catch {
      // fallthrough to naive replacement
    }
  }
  // naive replacement for common tokens
  const lngToken = typeof variables.lng === 'string' ? variables.lng : '';
  const nsToken = typeof variables.ns === 'string' ? variables.ns : '';
  return (template ?? '').replace('{{lng}}', lngToken).replace('{{ns}}', nsToken);
}
// https://stackoverflow.com/a/34890276/1837080
const groupByArray = function<T extends Record<string, unknown>>(xs: T[], key: string) {
  return xs.reduce<Array<{ key: string; values: T[] }>>((rv, x) => {
    const v = String(x[key]);
    const element = rv.find((r) => r.key === v);
    if (element) {
      element.values.push(x);
    } else {
      rv.push({ key: v, values: [x] });
    }
    return rv;
  }, []);
};
// Template is found at: https://www.i18next.com/misc/creating-own-plugins#backend;
// also took code from: https://github.com/i18next/i18next-node-fs-backend
export interface WriteQueueItem extends Record<string, unknown> {
  filename: string;
  key: string;
  fallbackValue: string;
  callback?: (error?: unknown, result?: unknown) => void;
}

export interface ReadCallbackEntry {
  callback: (error?: unknown, data?: unknown) => void;
}

export interface I18NextElectronBackendAdaptor {
  onReceive(channel: string, callback: (arguments_: unknown) => void): void;
  send(channel: string, payload: unknown): void;
}

export class Backend implements BackendModule {
  static type = 'backend';
  type = 'backend' as const;

  backendOptions: {
    debug?: boolean;
    loadPath?: string;
    addPath?: string;
    i18nextElectronBackend?: I18NextElectronBackendAdaptor;
  };
  i18nextOptions: InitOptions<Record<string, unknown>>;
  mainLog: string;
  readCallbacks: Record<string, ReadCallbackEntry | undefined>;
  rendererLog: string;
  services!: Services;
  useOverflow: boolean;
  writeCallbacks: Record<string, { callback: (error?: unknown, result?: unknown) => void } | undefined>;
  writeQueue: WriteQueueItem[];
  writeQueueOverflow: WriteQueueItem[];
  writeTimeout?: NodeJS.Timeout;

  constructor(services: Services, backendOptions: Record<string, unknown> = {}, i18nextOptions: InitOptions<Record<string, unknown>> = {}) {
    // initialize fields with defaults to satisfy definite assignment
    this.backendOptions = { ...(backendOptions || {}) };
    this.i18nextOptions = i18nextOptions || {};
    this.mainLog = '';
    this.readCallbacks = {};
    this.rendererLog = '';
    this.useOverflow = false;
    this.writeCallbacks = {};
    this.writeQueue = [];
    this.writeQueueOverflow = [];

    // call init to complete setup
    this.init(services, backendOptions, i18nextOptions);
  }

  init(services: Services, backendOptions: Record<string, unknown>, i18nextOptions: InitOptions<Record<string, unknown>>) {
    // safely access window.i18n without using `any`
    const maybeI18n = typeof window !== 'undefined' ? (window as unknown as { i18n?: { i18nextElectronBackend?: unknown } }).i18n : undefined;
    if (typeof window !== 'undefined' && maybeI18n?.i18nextElectronBackend === undefined) {
      throw new TypeError("'window.i18n.i18nextElectronBackend' is not defined! Be sure you are setting up your BrowserWindow's preload script properly!");
    }
    this.services = services;
    this.backendOptions = {
      ...defaultOptions,
      ...backendOptions,
      i18nextElectronBackend: maybeI18n?.i18nextElectronBackend as I18NextElectronBackendAdaptor | undefined,
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
    const i18nextElectronBackend = this.backendOptions.i18nextElectronBackend;
    if (!i18nextElectronBackend) return;

    i18nextElectronBackend.onReceive(I18NChannels.readFileResponse, (arguments_: unknown) => {
      const payload = arguments_ as { key?: string; error?: unknown; data?: string; filename?: string };
      // args:
      // {
      //   key
      //   error
      //   data
      // }
      // Don't know why we need this line;
      // upon initialization, the i18next library
      // ends up in this .on([channel], args) method twice
      if (!payload.key || typeof this.readCallbacks[payload.key] === 'undefined') {
        return;
      }
      if (payload.error) {
        // Failed to read translation file;
        // we pass back a fake "success" response
        // so that we create a translation file
        const entry = this.readCallbacks[payload.key];
        const callback_ = entry?.callback;
        this.readCallbacks[payload.key] = undefined;
        if (callback_ !== null && typeof callback_ === 'function') {
          callback_(null, {});
        }
      } else {
        let result: unknown;
        payload.data = (typeof payload.data === 'string' ? payload.data : '').replace(/^\uFEFF/, '');
        try {
          result = JSON.parse(payload.data ?? 'null');
        } catch (parseError) {
          const parseError_ = parseError as Error;
          parseError_.message = `Error parsing '${String(payload.filename)}'. Message: '${String(parseError)}'.`;
          const entry = this.readCallbacks[payload.key];
          const callback__ = entry?.callback;
          this.readCallbacks[payload.key] = undefined;
          if (callback__ !== null && typeof callback__ === 'function') {
            callback__(parseError_);
          }
          return;
        }
        const entry = this.readCallbacks[payload.key];
        const callback_ = entry?.callback;
        this.readCallbacks[payload.key] = undefined;
        if (callback_ !== null && typeof callback_ === 'function') {
          callback_(null, result as Readonly<Record<string, unknown>>);
        }
      }
    });
    i18nextElectronBackend.onReceive(I18NChannels.writeFileResponse, (arguments_: unknown) => {
      const payload = arguments_ as { keys?: string[]; error?: unknown };
      // args:
      // {
      //   keys
      //   error
      // }
      const { keys } = payload;
      if (!keys) return;
      for (const key of keys) {
        // Write methods don't have any callbacks from what I've seen,
        // so this is called more than I thought; but necessary!
        const entry = this.writeCallbacks[key];
        if (!entry) {
          return;
        }
        const callback_ = entry.callback;
        this.writeCallbacks[key] = undefined;
        if (payload.error) {
          callback_?.(payload.error);
        } else {
          callback_?.(null, true);
        }
      }
    });
  }

  // Writes a given translation to file
  write(writeQueue: WriteQueueItem[]) {
    const debug = Boolean(this.backendOptions.debug);
    const i18nextElectronBackend = this.backendOptions.i18nextElectronBackend;
    if (!i18nextElectronBackend) return;
    // Group by filename so we can make one request
    // for all changes within a given file
    const toWork = groupByArray(writeQueue, 'filename');
    for (const element of toWork as Array<{ key: string; values: Array<{ key: string; fallbackValue: string; callback?: (error?: unknown) => void }> }>) {
      const anonymous = (error: unknown, data: unknown) => {
        if (error) {
          console.error(`${this.rendererLog} encountered error when trying to read file '${element.key}' before writing missing translation`, { error });
          return;
        }
        const keySeparator = Boolean(this.i18nextOptions.keySeparator); // Do we have a key separator or not?
        const dataObject: Record<string, unknown> = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
        const writeKeys: string[] = [];
        for (let index = 0; index < element.values.length; index++) {
          const value = element.values[index];
          // If we have no key separator set, simply update the translation value
          if (!keySeparator) {
            dataObject[value.key] = value.fallbackValue;
          } else {
            const merged = mergeNestedI18NObject<Record<string, unknown>>(dataObject, value.key, String(this.i18nextOptions.keySeparator), value.fallbackValue);
            // copy merged result back to dataObject
            Object.keys(merged).forEach((k) => {
              dataObject[k] = merged[k];
            });
          }
          const writeKey = String(Math.random());
          if (value.callback) {
            this.writeCallbacks[writeKey] = {
              callback: value.callback,
            };
            writeKeys.push(writeKey);
          }
        }
        // Send out the message to the ipcMain process
        if (debug) {
          console.debug(`${this.rendererLog} requesting the missing key '${String(writeKeys)}' be written to file '${element.key}'.`);
        }
        i18nextElectronBackend.send(I18NChannels.writeFileRequest, {
          keys: writeKeys,
          filename: element.key,
          data: dataObject,
        });
      };
      this.requestFileRead(element.key, anonymous);
    }
  }

  // Reads a given translation file
  requestFileRead(filename: string, callback: (error?: unknown, data?: unknown) => void) {
    const i18nextElectronBackend = this.backendOptions.i18nextElectronBackend;
    if (!i18nextElectronBackend) {
      callback(new Error('i18nextElectronBackend not available'));
      return;
    }
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
  read(language: string, namespace: string, callback: ReadCallback) {
    const loadPathString = this.backendOptions.loadPath ?? defaultOptions.loadPath;
    const filename = safeInterpolate(this.services.interpolator, loadPathString, { lng: language, ns: namespace });
    this.requestFileRead(filename, (error?: unknown, data?: unknown) => {
      type ReadCallbackParameters = Parameters<ReadCallback>;
      if (error) {
        callback(error as unknown as ReadCallbackParameters[0], false as unknown as ReadCallbackParameters[1]);
        return;
      }
      callback(null as unknown as ReadCallbackParameters[0], data as ReadCallbackParameters[1]);
    });
  }

  // Not implementing at this time
  readMulti(_languages: readonly string[], _namespaces: readonly string[], _callback: MultiReadCallback) {
    throw new Error('Not implemented');
  }

  // Writes a missing translation to file
  create(languages: readonly string[], namespace: string, key: string, fallbackValue: string) {
    const { addPath } = this.backendOptions;
    let filename;
    // languages is readonly string[] per BackendModule signature
    const languageList = Array.isArray(languages) ? languages : [languages];
    // Create the missing translation for all languages
    for (const language of languageList) {
      const addPathString = addPath ?? defaultOptions.addPath;
      filename = safeInterpolate(this.services.interpolator, addPathString, { lng: language, ns: namespace });
      // If we are currently writing missing translations from writeQueue,
      // temporarily store the requests in writeQueueOverflow until we are
      // done writing to file
      const item: WriteQueueItem = { filename, key, fallbackValue };
      if (this.useOverflow) {
        this.writeQueueOverflow.push(item);
      } else {
        this.writeQueue.push(item);
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
