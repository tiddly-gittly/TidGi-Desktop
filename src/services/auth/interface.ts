/* eslint-disable unicorn/no-null */
import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { AuthenticationChannel } from '@/constants/channels';
import { IUserInfo as IAuthingUserInfo } from '@services/types';

export interface IUserInfos {
  userName: string;
  authing: IAuthingUserInfo | undefined;
}

/**
 * Handle login to Github GitLab Coding.net
 */
export interface IAuthenticationService {
  getUserInfos: () => IUserInfos;
  get<K extends keyof IUserInfos>(key: K): IUserInfos[K] | undefined;
  reset(): Promise<void>;
}
export const AuthenticationServiceIPCDescriptor = {
  channel: AuthenticationChannel.name,
  properties: {
    getUserInfos: ProxyPropertyType.Function,
    get: ProxyPropertyType.Function,
    reset: ProxyPropertyType.Function,
  },
};
