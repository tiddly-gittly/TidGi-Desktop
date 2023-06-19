/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable unicorn/no-null */
import { IGitUserInfos } from '@services/git/interface';
import { logger } from '@services/libs/log';
import { IAuthingUserInfo, SupportedStorageServices } from '@services/types';
import { IWorkspace } from '@services/workspaces/interface';
import settings from 'electron-settings';
import { injectable } from 'inversify';
import { debounce } from 'lodash';
import { nanoid } from 'nanoid';
import { BehaviorSubject } from 'rxjs';
import { IAuthenticationService, IUserInfos, ServiceBranchTypes, ServiceEmailTypes, ServiceTokenTypes, ServiceUserNameTypes } from './interface';

const defaultUserInfos = {
  userName: '',
  authing: undefined as IAuthingUserInfo | undefined,
};

@injectable()
export class Authentication implements IAuthenticationService {
  private cachedUserInfo: IUserInfos;
  public userInfo$: BehaviorSubject<IUserInfos>;

  constructor() {
    this.cachedUserInfo = this.getInitUserInfoForCache();
    this.userInfo$ = new BehaviorSubject<IUserInfos>(this.cachedUserInfo);
    this.setUserInfos = debounce(this.setUserInfos.bind(this), 10) as (newUserInfos: IUserInfos) => Promise<void>;
  }

  private updateUserInfoSubject(): void {
    this.userInfo$.next(this.cachedUserInfo);
  }

  public async getStorageServiceUserInfo(serviceName: SupportedStorageServices): Promise<IGitUserInfos | undefined> {
    const gitUserName = await this.get((serviceName + '-userName') as ServiceUserNameTypes);
    const email = await this.get((serviceName + '-email') as ServiceEmailTypes);
    const accessToken = await this.get((serviceName + '-token') as ServiceTokenTypes);
    const branch = (await this.get((serviceName + '-branch') as ServiceBranchTypes)) ?? 'main';
    if (gitUserName !== undefined && accessToken !== undefined) {
      return {
        gitUserName,
        email,
        accessToken,
        branch,
      };
    }
  }

  public async getRandomStorageServiceUserInfo(): Promise<{ info: IGitUserInfos; name: SupportedStorageServices } | undefined> {
    for (const serviceName of Object.values(SupportedStorageServices)) {
      const info = await this.getStorageServiceUserInfo(serviceName);
      if (info?.accessToken !== undefined && info.accessToken.length > 0 && info?.email !== undefined && info?.gitUserName !== undefined) {
        return { name: serviceName, info };
      }
    }
  }

  /**
   * load UserInfos in sync, and ensure it is an Object
   */
  private readonly getInitUserInfoForCache = (): IUserInfos => {
    let userInfosFromDisk = settings.getSync(`userInfos`) ?? {};
    userInfosFromDisk = typeof userInfosFromDisk === 'object' && !Array.isArray(userInfosFromDisk) ? userInfosFromDisk : {};
    return { ...defaultUserInfos, ...this.sanitizeUserInfo(userInfosFromDisk) };
  };

  private sanitizeUserInfo(info: Partial<IUserInfos>): Partial<IUserInfos> {
    return { ...info, 'github-branch': info['github-branch'] ?? 'main' };
  }

  /**
   * Batch update all UserInfos
   */
  private async setUserInfos(newUserInfos: IUserInfos): Promise<void> {
    await settings.set(`userInfos`, newUserInfos);
  }

  /**
   * get UserInfos, may return cached version
   */
  public getUserInfos = async (): Promise<IUserInfos> => {
    // store in memory to boost performance
    if (this.cachedUserInfo === undefined) {
      return this.getInitUserInfoForCache();
    }
    return this.cachedUserInfo;
  };

  public async get<K extends keyof IUserInfos>(key: K): Promise<IUserInfos[K] | undefined> {
    if (this.cachedUserInfo[key] !== null && this.cachedUserInfo[key] !== undefined) {
      return this.cachedUserInfo[key];
    }
  }

  public async set<K extends keyof IUserInfos>(key: K, value: IUserInfos[K]): Promise<void> {
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

  public async generateOneTimeAdminAuthTokenForWorkspace(workspaceID: string): Promise<string> {
    return this.generateOneTimeAdminAuthTokenForWorkspaceSync(workspaceID);
  }

  public generateOneTimeAdminAuthTokenForWorkspaceSync(workspaceID: string): string {
    const newAuthToken = nanoid().toLowerCase();
    logger.debug(`generateOneTimeAdminAuthTokenForWorkspace() newAuthToken for ${workspaceID} is ${newAuthToken}`);
    return newAuthToken;
  }

  /**
   * use workspace specific userName first, and fall back to preferences' userName, pass empty editor username if undefined
   * @param workspace the workspace to get userName setting from
   */
  public async getUserName(workspace: IWorkspace): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    const userName = (workspace.userName || (await this.get('userName'))) ?? '';
    return userName;
  }
}
