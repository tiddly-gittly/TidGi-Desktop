import { lazyInject } from '@services/container';
import { IDatabaseService } from '@services/database/interface';
import { IGitUserInfos } from '@services/git/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { SupportedStorageServices } from '@services/types';
import { isWikiWorkspace, IWorkspace } from '@services/workspaces/interface';
import { injectable } from 'inversify';
import { truncate } from 'lodash';
import { nanoid } from 'nanoid';
import { BehaviorSubject } from 'rxjs';
import { IAuthenticationService, IUserInfos, ServiceBranchTypes, ServiceEmailTypes, ServiceTokenTypes, ServiceUserNameTypes } from './interface';

const defaultUserInfos = {
  userName: '',
};

@injectable()
export class Authentication implements IAuthenticationService {
  private cachedUserInfo: IUserInfos | undefined;
  public userInfo$ = new BehaviorSubject<IUserInfos | undefined>(undefined);

  @lazyInject(serviceIdentifier.Database)
  private readonly databaseService!: IDatabaseService;

  public updateUserInfoSubject(): void {
    this.userInfo$.next(this.getUserInfos());
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
      if (info?.accessToken !== undefined && info.accessToken.length > 0 && info.email !== undefined && info.gitUserName !== undefined) {
        return { name: serviceName, info };
      }
    }
  }

  /**
   * load UserInfos in sync, and ensure it is an Object
   */
  private getInitUserInfoForCache(): IUserInfos {
    let userInfosFromDisk: Partial<IUserInfos> = this.databaseService.getSetting('userInfos') ?? {};
    userInfosFromDisk = typeof userInfosFromDisk === 'object' && !Array.isArray(userInfosFromDisk) ? userInfosFromDisk : ({} satisfies Partial<IUserInfos>);
    return { ...defaultUserInfos, ...this.sanitizeUserInfo(userInfosFromDisk) };
  }

  private sanitizeUserInfo(info: Partial<IUserInfos>): Partial<IUserInfos> {
    return { ...info, 'github-branch': info['github-branch'] ?? 'main' };
  }

  public setUserInfos(newUserInfos: IUserInfos): void {
    logger.debug('Storing authInfos', { function: 'setUserInfos' });
    this.cachedUserInfo = newUserInfos;
    this.databaseService.setSetting('userInfos', newUserInfos);
    this.updateUserInfoSubject();
  }

  public getUserInfos(): IUserInfos {
    // store in memory to boost performance
    if (this.cachedUserInfo === undefined) {
      this.cachedUserInfo = this.getInitUserInfoForCache();
    }
    return this.cachedUserInfo;
  }

  public async get<K extends keyof IUserInfos>(key: K): Promise<IUserInfos[K] | undefined> {
    const userInfo = this.getUserInfos();
    if (userInfo[key] !== null && userInfo[key] !== undefined) {
      return userInfo[key];
    }
  }

  public async set<K extends keyof IUserInfos>(key: K, value: IUserInfos[K]): Promise<void> {
    logger.debug('Setting auth, debug value is truncated for privacy', { key, value: truncate(value, { length: 10 }), function: 'Authentication.set' });
    let userInfo = this.getUserInfos();
    userInfo[key] = value;
    userInfo = { ...userInfo, ...this.sanitizeUserInfo(userInfo) };
    this.setUserInfos(userInfo);
  }

  public async reset(): Promise<void> {
    this.setUserInfos(defaultUserInfos);
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
    const userName = (isWikiWorkspace(workspace) ? workspace.userName : '') || (await this.get('userName')) || '';
    return userName;
  }
}
