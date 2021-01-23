/* eslint-disable unicorn/no-null */
import { injectable } from 'inversify';
import settings from 'electron-settings';
import { IUserInfo as IAuthingUserInfo } from '@services/types';
import { IAuthenticationService, IUserInfos } from './interface';

const defaultUserInfos = {
  userName: 'TiddlyGit User',
  authing: undefined as IAuthingUserInfo | undefined,
};

@injectable()
export class Authentication implements IAuthenticationService {
  cachedUserInfo: IUserInfos;
  readonly version = '2021.1';

  constructor() {
    this.cachedUserInfo = this.getInitUserInfoForCache();
  }

  /**
   * load UserInfos in sync, and ensure it is an Object
   */
  getInitUserInfoForCache = (): IUserInfos => {
    let userInfosFromDisk = settings.getSync(`userInfo.${this.version}`) ?? {};
    userInfosFromDisk = typeof userInfosFromDisk === 'object' && !Array.isArray(userInfosFromDisk) ? userInfosFromDisk : {};
    return { ...defaultUserInfos, ...this.sanitizeUserInfo(userInfosFromDisk) };
  };

  private sanitizeUserInfo(info: Partial<IUserInfos>): Partial<IUserInfos> {
    return info;
  }

  /**
   * Batch update all UserInfos
   */
  private async setUserInfos(newUserInfos: IUserInfos): Promise<void> {
    await settings.set(`userInfos.${this.version}`, newUserInfos as any);
  }

  /**
   * get UserInfos, may return cached version
   */
  public getUserInfos = (): IUserInfos => {
    // store in memory to boost performance
    if (this.cachedUserInfo === undefined) {
      return this.getInitUserInfoForCache();
    }
    return this.cachedUserInfo;
  };

  public get<K extends keyof IUserInfos>(key: K): IUserInfos[K] | undefined {
    if (this.cachedUserInfo[key] !== null && this.cachedUserInfo[key] !== undefined) {
      return this.cachedUserInfo[key];
    }
  }

  public async reset(): Promise<void> {
    await settings.unset();
    const UserInfos = this.getUserInfos();
    this.cachedUserInfo = UserInfos;
    await this.setUserInfos(UserInfos);
    // TODO: sendToAllWindows
    // Object.keys(UserInfos).forEach((key) => {
    //   const value = UserInfos[key as keyof IUserInfos];
    //   this.windowService.sendToAllWindows(UserInfoChannel.update, key, value);
    // });
  }
}
