import { isElectronDevelopment } from '@/constants/isElectronDevelopment';
import { app, net } from 'electron';
import { injectable } from 'inversify';
import os from 'os';
import process from 'process';

import * as appPaths from '@/constants/appPaths';
import * as auth from '@/constants/auth';
import { supportedLanguagesMap, tiddlywikiLanguagesMap } from '@/constants/languages';
import * as paths from '@/constants/paths';
import { getMainWindowEntry } from '@services/windows/viteEntry';
import type { IAuthConstants, IConstants, IContext, IContextService, IPaths } from './interface';

@injectable()
export class ContextService implements IContextService {
  // @ts-expect-error Property 'MAIN_WINDOW_WEBPACK_ENTRY' is missing, esbuild will make it `pathConstants = { ..._constants_paths__WEBPACK_IMPORTED_MODULE_4__, ..._constants_appPaths__WEBPACK_IMPORTED_MODULE_5__, 'http://localhost:3012/main_window' };`
  private readonly pathConstants: IPaths = { ...paths, ...appPaths };
  private readonly authConstants: IAuthConstants = { ...auth };
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
    this.pathConstants.MAIN_WINDOW_WEBPACK_ENTRY = getMainWindowEntry();
    this.context = {
      ...this.pathConstants,
      ...this.constants,
      ...this.authConstants,
    };
  }

  public async get<K extends keyof IContext>(key: K): Promise<IContext[K]> {
    if (key in this.context) {
      return this.context[key];
    }

    throw new Error(`${String(key)} not existed in ContextService`);
  }

  public async isOnline(): Promise<boolean> {
    return net.isOnline();
  }
}
