/* eslint-disable unicorn/no-null */
import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { AuthenticationChannel } from '@/constants/channels';
import { BehaviorSubject } from 'rxjs';
import { IGitUserInfos } from '@services/git/interface';
import { SupportedStorageServices } from '@services/types';

export type ServiceTokenTypes = `${SupportedStorageServices}-token`;
/** Git Login: token */
type TokenRecord = Record<ServiceTokenTypes, string>;

export type ServiceUserNameTypes = `${SupportedStorageServices}-userName`;
/** Git Login: username , this is also used to filter user's repo when searching repo */
type UserNameRecord = Record<ServiceUserNameTypes, string>;

export type ServiceEmailTypes = `${SupportedStorageServices}-email`;
/** Git push: Git commit message email, you may use different email for different storage service */
type EmailRecord = Record<ServiceEmailTypes, string>;

export type IUserInfos = {
  /** UserName in TiddlyWiki */
  userName: string;
} & Partial<TokenRecord> &
  Partial<UserNameRecord> &
  Partial<EmailRecord>;

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
