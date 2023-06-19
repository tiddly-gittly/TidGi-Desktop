/* eslint-disable unicorn/no-null */
import { AuthenticationChannel } from '@/constants/channels';
import { IGitUserInfos } from '@services/git/interface';
import { SupportedStorageServices } from '@services/types';
import { IWorkspace } from '@services/workspaces/interface';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { BehaviorSubject } from 'rxjs';

export type ServiceTokenTypes = `${SupportedStorageServices}-token`;
export const getServiceTokenTypes = (serviceType: SupportedStorageServices): ServiceTokenTypes => `${serviceType}-token`;
/** Git Login: token */
type TokenRecord = Record<ServiceTokenTypes, string>;

export type ServiceUserNameTypes = `${SupportedStorageServices}-userName`;
export const getServiceUserNameTypes = (serviceType: SupportedStorageServices): ServiceUserNameTypes => `${serviceType}-userName`;
/** Git Login: username , this is also used to filter user's repo when searching repo */
type UserNameRecord = Record<ServiceUserNameTypes, string>;

export type ServiceEmailTypes = `${SupportedStorageServices}-email`;
export const getServiceEmailTypes = (serviceType: SupportedStorageServices): ServiceEmailTypes => `${serviceType}-email`;
/** Git push: Git commit message email, you may use different email for different storage service */
type EmailRecord = Record<ServiceEmailTypes, string>;

export type ServiceBranchTypes = `${SupportedStorageServices}-branch`;
export const getServiceBranchTypes = (serviceType: SupportedStorageServices): ServiceBranchTypes => `${serviceType}-branch`;
/** Git push: Git commit message branch, you may use different branch for different storage service */
type BranchRecord = Record<ServiceBranchTypes, string>;

export type IUserInfos =
  & {
    /** Default UserName in TiddlyWiki, each wiki can have different username, but fallback to this if not specific on */
    userName: string;
  }
  & Partial<TokenRecord>
  & Partial<UserNameRecord>
  & Partial<EmailRecord>
  & Partial<BranchRecord>;

/**
 * Handle login to Github GitLab Coding.net
 */
export interface IAuthenticationService {
  generateOneTimeAdminAuthTokenForWorkspace(workspaceID: string): Promise<string>;
  /**
   * This is for internal use
   */
  generateOneTimeAdminAuthTokenForWorkspaceSync(workspaceID: string): string;
  get<K extends keyof IUserInfos>(key: K): Promise<IUserInfos[K] | undefined>;
  /**
   * Get a random storage info, useful for checking if user have any token in the storage
   */
  getRandomStorageServiceUserInfo(): Promise<{ info: IGitUserInfos; name: SupportedStorageServices } | undefined>;
  getStorageServiceUserInfo(serviceName: SupportedStorageServices): Promise<IGitUserInfos | undefined>;
  getUserInfos: () => Promise<IUserInfos>;
  getUserName(workspace: IWorkspace): Promise<string>;
  reset(): Promise<void>;
  set<K extends keyof IUserInfos>(key: K, value: IUserInfos[K]): Promise<void>;
  userInfo$: BehaviorSubject<IUserInfos>;
}
export const AuthenticationServiceIPCDescriptor = {
  channel: AuthenticationChannel.name,
  properties: {
    generateOneTimeAdminAuthTokenForWorkspace: ProxyPropertyType.Function,
    get: ProxyPropertyType.Function,
    getRandomStorageServiceUserInfo: ProxyPropertyType.Function,
    getStorageServiceUserInfo: ProxyPropertyType.Function,
    getUserInfos: ProxyPropertyType.Function,
    getUserName: ProxyPropertyType.Function,
    reset: ProxyPropertyType.Function,
    set: ProxyPropertyType.Function,
    userInfo$: ProxyPropertyType.Value$,
  },
};

export interface IGithubOAuthResult {
  avatar_url: string;
  bio: any;
  blog: string;
  company: any;
  created_at: string;
  email: any;
  events_url: string;
  followers: number;
  followers_url: string;
  following: number;
  following_url: string;
  gists_url: string;
  gravatar_id: string;
  hireable: any;
  html_url: string;
  id: number;
  location: any;
  login: string;
  name: any;
  node_id: string;
  organizations_url: string;
  public_gists: number;
  public_repos: number;
  received_events_url: string;
  repos_url: string;
  site_admin: boolean;
  starred_url: string;
  subscriptions_url: string;
  twitter_username: any;
  type: string;
  updated_at: string;
  url: string;
}
