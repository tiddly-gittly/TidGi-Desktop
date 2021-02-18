/* eslint-disable unicorn/no-null */
import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { AuthenticationChannel } from '@/constants/channels';

export interface IUserInfos {
  userName: string;
  'github-token'?: string;
}

/**
 * Handle login to Github GitLab Coding.net
 */
export interface IAuthenticationService {
  getUserInfos: () => IUserInfos;
  get<K extends keyof IUserInfos>(key: K): IUserInfos[K] | undefined;
  set<K extends keyof IUserInfos>(key: K, value: IUserInfos[K]): void;
  reset(): Promise<void>;
}
export const AuthenticationServiceIPCDescriptor = {
  channel: AuthenticationChannel.name,
  properties: {
    getUserInfos: ProxyPropertyType.Function,
    get: ProxyPropertyType.Function,
    set: ProxyPropertyType.Function,
    reset: ProxyPropertyType.Function,
  },
};
