/* eslint-disable @typescript-eslint/require-await */
import { app, net } from 'electron';
import process from 'process';
import os from 'os';
import { isElectronDevelopment } from '@/constants/isElectronDevelopment';
import { injectable } from 'inversify';

import { IContextService, IContext, IPaths, IConstants } from './interface';
import * as paths from '@/constants/paths';
import * as appPaths from '@/constants/appPaths';
import { tiddlywikiLanguagesMap, supportedLanguagesMap } from '@/constants/languages';
import { getLocalHostUrlWithActualIP } from '@services/libs/url';

@injectable()
export class ContextService implements IContextService {
  private readonly pathConstants: IPaths = { ...paths, ...appPaths, MAIN_WINDOW_WEBPACK_ENTRY: MAIN_WINDOW_WEBPACK_ENTRY };
  private readonly constants: IConstants = {
    isDevelopment: isElectronDevelopment,
    platform: process.platform,
    appVersion: app.getVersion(),
    appName: app.name,
    oSVersion: os.release(),
    environmentVersions: process.versions,
    tiddlywikiLanguagesMap,
    supportedLanguagesMap,
  };

  private readonly context: IContext;
  constructor() {
    this.context = {
      ...this.pathConstants,
      ...this.constants,
    };
  }

  public async get<K extends keyof IContext>(key: K): Promise<IContext[K]> {
    if (key in this.context) {
      return this.context[key];
    }

    throw new Error(`${String(key)} not existed in ContextService`);
  }

  public async getLocalHostUrlWithActualIP(oldUrl: string): Promise<string> {
    return await getLocalHostUrlWithActualIP(oldUrl);
  }

  public async isOnline(): Promise<boolean> {
    return net.isOnline();
  }
}
