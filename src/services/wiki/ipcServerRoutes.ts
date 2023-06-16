/**
 * Expose apis that ipc sync adaptor will use
 */

import fs from 'fs-extra';
import omit from 'lodash/omit';
import path from 'path';
import type { ITiddlerFields, ITiddlyWiki } from 'tiddlywiki';

export interface IWikiServerRouteResponse {
  data?: string | Buffer;
  headers?: Record<string, string>;
  statusCode?: number;
}

type IGetTiddlerObject = Record<string, string | number> & { fields: Record<string, string | number> };

export class IpcServerRoutes {
  private wikiInstance!: ITiddlyWiki;
  private readonly pendingIpcServerRoutesRequests: Array<(value: void | PromiseLike<void>) => void> = [];

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
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        const type = this.wikiInstance.config.fileExtensionInfo[extension] ? $tw.config.fileExtensionInfo[extension].type : 'application/octet-stream';
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
    const text = JSON.stringify({
      username: userName,
      anonymous: false,
      read_only: false,
      space: {
        recipe: 'default',
      },
      tiddlywiki_version: $tw.version,
    });
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, data: text };
  }

  async getTiddler(title: string): Promise<IWikiServerRouteResponse> {
    await this.waitForIpcServerRoutesAvailable();
    const tiddler = this.wikiInstance.wiki.getTiddler(title);
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const tiddlerFields = {} as IGetTiddlerObject;
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
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (tiddler) {
      Object.keys(tiddler.fields).forEach((name) => {
        const value = tiddler.getFieldStrings(name);
        if (knownFields.has(name)) {
          tiddlerFields[name] = value;
        } else {
          if (tiddlerFields.fields === undefined) {
            tiddlerFields.fields = {};
          }
          tiddlerFields.fields[name] = value;
        }
      });
      tiddlerFields.revision = this.wikiInstance.wiki.getChangeCount(title);
      tiddlerFields.bag = 'default';
      tiddlerFields.type = tiddlerFields.type ?? 'text/vnd.tiddlywiki';
      return { statusCode: 200, headers: { 'Content-Type': 'application/json; charset=utf8' }, data: JSON.stringify(tiddlerFields) };
    } else {
      return { statusCode: 404, headers: { 'Content-Type': 'text/plain' }, data: `Tiddler "${title}" not exist` };
    }
  }

  async getTiddlersJSON(filter = '[all[tiddlers]!is[system]sort[title]]', exclude = ['text']): Promise<IWikiServerRouteResponse> {
    await this.waitForIpcServerRoutesAvailable();
    if (this.wikiInstance.wiki.getTiddlerText('$:/config/SyncSystemTiddlersFromServer') === 'no') {
      filter += '+[!is[system]]';
    }
    const titles = this.wikiInstance.wiki.filterTiddlers(filter);
    const tiddlers = titles.map(title => {
      const tiddler = this.wikiInstance.wiki.getTiddler(title);
      if (tiddler !== undefined) {
        const tiddlerFields = omit(tiddler.fields, exclude) as Record<string, string | number>;
        tiddlerFields.revision = this.wikiInstance.wiki.getChangeCount(title);
        tiddlerFields.type = tiddlerFields.type ?? 'text/vnd.tiddlywiki';
        return tiddlerFields;
      }
      // eslint-disable-next-line unicorn/no-useless-undefined
      return undefined;
    }).filter(item => item !== undefined);

    const tiddlersJSON = JSON.stringify(tiddlers);
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, data: tiddlersJSON };
  }

  async putTiddler(title: string, fields: ITiddlerFields): Promise<IWikiServerRouteResponse> {
    await this.waitForIpcServerRoutesAvailable();
    let tiddlerFieldsToPut: Record<string, string | number> = {};
    // Pull up any subfields in the `fields` object
    if ('fields' in fields) {
      tiddlerFieldsToPut = {
        ...fields.fields as Record<string, string | number>,
      };
    }
    tiddlerFieldsToPut = {
      ...tiddlerFieldsToPut,
      // Remove any revision field
      ...omit(fields, ['fields', 'revision', '_is_skinny']) as Record<string, string | number>,
    };
    // If this is a skinny tiddler, it means the client never got the full
    // version of the tiddler to edit. So we must preserve whatever text
    // already exists on the server, or else we'll inadvertently delete it.
    if (fields._is_skinny !== undefined) {
      const tiddler = this.wikiInstance.wiki.getTiddler(title);
      if (tiddler !== undefined) {
        tiddlerFieldsToPut.text = tiddler.fields.text;
      }
    }
    this.wikiInstance.wiki.addTiddler(new $tw.Tiddler(fields, { title }));
    const changeCount = this.wikiInstance.wiki.getChangeCount(title).toString();
    return { statusCode: 204, headers: { 'Content-Type': 'text/plain', Etag: `"default/${encodeURIComponent(title)}/${changeCount}:"` }, data: 'OK' };
  }
}
