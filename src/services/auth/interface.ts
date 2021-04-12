/* eslint-disable unicorn/no-null */
import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { AuthenticationChannel } from '@/constants/channels';
import { BehaviorSubject } from 'rxjs';
import { IGitUserInfos } from '@services/git/interface';
import { SupportedStorageServices } from '@services/types';

export interface IUserInfos {
  /** UserName in TiddlyWiki */
  userName: string;
  /** Git commit message email */
  email: string;
  /** Github Login: token */
  'github-token'?: string;
  /** Github Login: username , this is also used to filter user's repo when searching repo */
  'github-userName'?: string;
}

/**
 * Handle login to Github GitLab Coding.net
 */
export interface IAuthenticationService {
  userInfo$: BehaviorSubject<IUserInfos>;
  getStorageServiceUserInfo(serviceName: SupportedStorageServices): IGitUserInfos | undefined;
  /**
   * Get a random storage info, useful for checking if user have any token in the storage
   */
  getRandomStorageServiceUserInfo(): { name: SupportedStorageServices; info: IGitUserInfos } | undefined;
  getUserInfos: () => IUserInfos;
  get<K extends keyof IUserInfos>(key: K): IUserInfos[K] | undefined;
  set<K extends keyof IUserInfos>(key: K, value: IUserInfos[K]): void;
  reset(): Promise<void>;
}
export const AuthenticationServiceIPCDescriptor = {
  channel: AuthenticationChannel.name,
  properties: {
    userInfo$: ProxyPropertyType.Value$,
    getStorageServiceUserInfo: ProxyPropertyType.Function,
    getRandomStorageServiceUserInfo: ProxyPropertyType.Function,
    getUserInfos: ProxyPropertyType.Function,
    get: ProxyPropertyType.Function,
    set: ProxyPropertyType.Function,
    reset: ProxyPropertyType.Function,
  },
};
