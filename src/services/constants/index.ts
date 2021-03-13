import { app } from 'electron';
import process from 'process';
import path from 'path';
import os from 'os';
import isDevelopment from 'electron-is-dev';
import { injectable } from 'inversify';

import { IContextService, IContext, IPaths, IConstants } from './interface';
import * as paths from '@services/constants/paths';

@injectable()
export class ContextService implements IContextService {
  private pathConstants: IPaths = paths;
  private constants: IConstants = {
    isDevelopment,
    platform: process.platform,
    appVersion: app.getVersion(),
    appName: app.name,
    oSVersion: os.release(),
    environmentVersions: process.versions,
  };
  private context: IContext;
  constructor() {
    this.context = {
      ...this.pathConstants,
      ...this.constants,
    };
  }

  public get<K extends keyof IContext>(key: K): IContext[K] {
    if (key in this.context) {
      return this.context[key];
    }

    throw new Error(`${String(key)} not existed in ContextService`);
  }
}
