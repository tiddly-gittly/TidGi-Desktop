import { app } from 'electron';
import process from 'process';
import os from 'os';
import isDevelopment from 'electron-is-dev';
import { injectable } from 'inversify';

import { IContextService, IContext, IPaths, IConstants } from './interface';
import * as paths from '@services/constants/paths';

@injectable()
export class ContextService implements IContextService {
  pathConstants: IPaths = paths;
  constants: IConstants = {
    isDevelopment,
    platform: process.platform,
    appVersion: app.getVersion(),
    appName: app.name,
    oSVersion: os.release(),
    environmentVersions: process.versions,
  };

  public get<K extends keyof IContext>(key: K): IContext[K] {
    if (key in this.pathConstants) {
      return this.pathConstants[key];
    }
    if (key in this.constants) {
      return this.constants[key];
    }

    throw new Error(`${String(key)} not existed in ContextService`);
  }
}
