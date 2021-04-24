declare module 'errio' {
  export function parse(error: Error): Error;
  export function stringify(error: Error): string;
  export function register(error: ErrorConstructor): void;
}
declare module '*.png' {
  const value: string;
  export default value;
}
declare module '*.svg' {
  const value: string;
  export default value;
}
declare module '@authing/sso' {
  export interface ILoginInfo {
    userInfo: UserInfo;
    urlParams: UrlParameters;
  }
  export interface ITrackSessionResultSuccess extends ILoginInfo {
    session: Session;
  }
  export interface ITrackSessionResultFailed {
    session: null;
  }
  export type ITrackSessionResult = ITrackSessionResultSuccess | ITrackSessionResultFailed;

  export interface Session {
    appId: string;
    type: string;
    userId: string;
  }

  export interface UserInfo {
    _id: string;
    email: string;
    registerInClient: string;
    token: string;
    tokenExpiredAt: string;
    photo: string;
    company: string;
    nickname: string;
    username: string;
    oauth?: string;
    thirdPartyIdentity?: {
      accessToken?: string;
      provider?: string;
    };
  }

  export interface UrlParameters {
    code: string;
    id_token: string;
    access_token: string;
  }

  export default class AuthingSSO {
    constructor(options: { appId: string; appDomain: string; redirectUrl: string });
    trackSession(): Promise<ITrackSessionResult>;
    logout(): Promise<{ code: number; message?: string }>;
    login(): Promise<void>;
  }
}
