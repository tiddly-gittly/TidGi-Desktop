import { injectable } from 'inversify';
import isDevelopment from 'electron-is-dev';

import { IContextService, IContext, IPaths, IConstants } from './interface';
import * as paths from '@services/constants/paths';

@injectable()
export class ContextService implements IContextService {
  pathConstants: IPaths = paths;
  constants: IConstants = {
    isDevelopment,
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
