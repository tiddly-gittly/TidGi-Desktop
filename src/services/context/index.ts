import { isElectronDevelopment } from '@/constants/isElectronDevelopment';
import { LOCALIZATION_FOLDER } from '@/constants/paths';
import { app, net } from 'electron';
import fs from 'fs-extra';
import { injectable } from 'inversify';
import os from 'os';
import path from 'path';
import process from 'process';

import * as appPaths from '@/constants/appPaths';
import * as paths from '@/constants/paths';
import { getMainWindowEntry } from '@services/windows/viteEntry';
import type { IConstants, IContext, IContextService, IPaths } from './interface';

@injectable()
export class ContextService implements IContextService {
  // @ts-expect-error Property 'MAIN_WINDOW_WEBPACK_ENTRY' is missing, esbuild will make it `pathConstants = { ..._constants_paths__WEBPACK_IMPORTED_MODULE_4__, ..._constants_appPaths__WEBPACK_IMPORTED_MODULE_5__, 'http://localhost:3012/main_window' };`
  private readonly pathConstants: IPaths = { ...paths, ...appPaths };
  private readonly constants: IConstants = {
    isDevelopment: isElectronDevelopment,
    platform: process.platform,
    appVersion: app.getVersion(),
    appName: app.name,
    oSVersion: os.release(),
    environmentVersions: process.versions,
  };

  private readonly context: IContext;
  private initialized = false;

  constructor() {
    this.pathConstants.MAIN_WINDOW_WEBPACK_ENTRY = getMainWindowEntry();
    this.context = {
      ...this.pathConstants,
      ...this.constants,
      supportedLanguagesMap: {},
      tiddlywikiLanguagesMap: {},
    };
  }

  /**
   * Initialize language maps after app is ready
   * Must be called before any code tries to access language maps
   * This ensures LOCALIZATION_FOLDER path is correct (process.resourcesPath is stable)
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      const supportedLanguagesPath = path.join(LOCALIZATION_FOLDER, 'supportedLanguages.json');
      const tiddlywikiLanguagesPath = path.join(LOCALIZATION_FOLDER, 'tiddlywikiLanguages.json');

      const [supportedLanguagesMap, tiddlywikiLanguagesMap] = await Promise.all([
        fs.readJson(supportedLanguagesPath) as Promise<Record<string, string>>,
        fs.readJson(tiddlywikiLanguagesPath) as Promise<Record<string, string | undefined>>,
      ]);
      this.context.supportedLanguagesMap = supportedLanguagesMap ?? {};
      this.context.tiddlywikiLanguagesMap = tiddlywikiLanguagesMap ?? {};

      this.initialized = true;
    } catch (error) {
      console.error('Failed to load language maps:', error);
      // Keep empty objects as fallback
    }
  }

  public async get<K extends keyof IContext>(key: K): Promise<IContext[K]> {
    if (key in this.context) {
      return this.context[key];
    }

    throw new Error(`${key} not existed in ContextService`);
  }

  public async isOnline(): Promise<boolean> {
    return net.isOnline();
  }
}
