/* eslint-disable unicorn/no-null */
import { injectable } from 'inversify';
import settings from 'electron-settings';
import { IAuthingUserInfo, SupportedStorageServices } from '@services/types';
import { lazyInject } from '@services/container';
import type { IWindowService } from '@services/windows/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { IAuthenticationService, IUserInfos, ServiceEmailTypes, ServiceTokenTypes, ServiceUserNameTypes } from './interface';
import { BehaviorSubject } from 'rxjs';
import { IGitUserInfos } from '@services/git/interface';

const defaultUserInfos = {
  userName: 'TiddlyGit User',
  authing: undefined as IAuthingUserInfo | undefined,
};

@injectable()
export class Authentication implements IAuthenticationService {
  @lazyInject(serviceIdentifier.Window) private readonly windowService!: IWindowService;

  private cachedUserInfo: IUserInfos;
  private readonly version = '2021.1';
  public userInfo$: BehaviorSubject<IUserInfos>;

  constructor() {
    this.cachedUserInfo = this.getInitUserInfoForCache();
    this.userInfo$ = new BehaviorSubject<IUserInfos>(this.cachedUserInfo);
  }

  private updateUserInfoSubject(): void {
    this.userInfo$.next(this.cachedUserInfo);
  }

  public getStorageServiceUserInfo(serviceName: SupportedStorageServices): IGitUserInfos | undefined {
    const gitUserName = this.get(`${serviceName}-userName` as ServiceUserNameTypes);
    const email = this.get(`${serviceName}-email` as ServiceEmailTypes);
    const accessToken = this.get(`${serviceName}-token` as ServiceTokenTypes);
    if (gitUserName !== undefined && email !== undefined && accessToken !== undefined) {
      return {
        gitUserName,
        email,
        accessToken,
      };
    }
  }

  public getRandomStorageServiceUserInfo(): { name: SupportedStorageServices; info: IGitUserInfos } | undefined {
    for (const serviceName of Object.values(SupportedStorageServices)) {
      const info = this.getStorageServiceUserInfo(serviceName);
      if (info?.accessToken !== undefined && info.accessToken.length > 0 && info?.email !== undefined && info?.gitUserName !== undefined) {
        return { name: serviceName, info };
      }
    }
  }

  /**
   * load UserInfos in sync, and ensure it is an Object
   */
  private readonly getInitUserInfoForCache = (): IUserInfos => {
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

  public set<K extends keyof IUserInfos>(key: K, value: IUserInfos[K]): void {
    this.cachedUserInfo[key] = value;
    this.cachedUserInfo = { ...this.cachedUserInfo, ...this.sanitizeUserInfo(this.cachedUserInfo) };
    this.updateUserInfoSubject();
    void this.setUserInfos(this.cachedUserInfo);
  }

  public async reset(): Promise<void> {
    await settings.unset();
    this.cachedUserInfo = this.getInitUserInfoForCache();
    await this.setUserInfos(this.cachedUserInfo);
    this.updateUserInfoSubject();
  }
}
