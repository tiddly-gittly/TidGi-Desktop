/* eslint-disable unicorn/no-null */
import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { AuthenticationChannel } from '@/constants/channels';
import { BehaviorSubject } from 'rxjs';

export interface IUserInfos {
  userName: string;
  'github-token'?: string;
  'github-userName'?: string;
}

/**
 * Handle login to Github GitLab Coding.net
 */
export interface IAuthenticationService {
  userInfo$: BehaviorSubject<IUserInfos>;
  getUserInfos: () => IUserInfos;
  get<K extends keyof IUserInfos>(key: K): IUserInfos[K] | undefined;
  set<K extends keyof IUserInfos>(key: K, value: IUserInfos[K]): void;
  reset(): Promise<void>;
}
export const AuthenticationServiceIPCDescriptor = {
  channel: AuthenticationChannel.name,
  properties: {
    userInfo$: ProxyPropertyType.Value$,
    getUserInfos: ProxyPropertyType.Function,
    get: ProxyPropertyType.Function,
    set: ProxyPropertyType.Function,
    reset: ProxyPropertyType.Function,
  },
};
