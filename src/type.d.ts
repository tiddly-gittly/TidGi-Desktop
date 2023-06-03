/* eslint-disable @typescript-eslint/naming-convention */
declare module 'errio' {
  export function parse(error: Error): Error;
  export function stringify(error: Error): string;
  export function register(error: ErrorConstructor): void;
}

declare module '@tiddlygit/tiddlywiki' {
  export * from 'tiddlywiki';
}

declare module 'sqlite-vss' {
  export interface Database {
    // after https://deno.land/x/sqlite3@0.8.0/mod.ts?s=Database#method_loadExtension_0
    loadExtension(file: string, entrypoint?: string | undefined): void;
  }

  /**
   * Loads the sqlite-vss extension on the given sqlite3 database.
   */
  export function loadVector(database: Database): void;
  /**
   * Loads the sqlite-vss extension on the given sqlite3 database.
   */
  export function loadVss(database: Database): void;

  /**
   * Loads the sqlite-vss extension on the given sqlite3 database.
   */
  export function load(database: Database): void;
}

declare module 'threads-plugin' {
  const value: any;
  export default value;
}
declare module 'v8-compile-cache-lib' {
  export namespace __TEST__ {
    export function getMainName(): string;
    export function getCacheDir(): string;
    export function supportsCachedData(): boolean;
  }
  export function install(options?: {
    cacheDir?: string;
    prefix?: string;
  }): {
    uninstall(): void;
  } | undefined;
}
declare module 'webpack2-externals-plugin' {
  const value: any;
  export default value;
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
    urlParams: UrlParameters;
    userInfo: UserInfo;
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
    company: string;
    email: string;
    nickname: string;
    oauth?: string;
    photo: string;
    registerInClient: string;
    thirdPartyIdentity?: {
      accessToken?: string;
      provider?: string;
    };
    token: string;
    tokenExpiredAt: string;
    username: string;
  }

  export interface UrlParameters {
    access_token: string;
    code: string;
    id_token: string;
  }

  export default class AuthingSSO {
    constructor(options: { appDomain: string; appId: string; redirectUrl: string });
    trackSession(): Promise<ITrackSessionResult>;
    logout(): Promise<{ code: number; message?: string }>;
    login(): Promise<void>;
  }
}

interface IDefaultGatewayInfo {
  gateway: string;
  interface: 'WLAN';
}
declare module 'default-gateway/ibmi' {
  export function v4(): Promise<IDefaultGatewayInfo>;
}
declare module 'default-gateway/android' {
  export function v4(): Promise<IDefaultGatewayInfo>;
}
declare module 'default-gateway/darwin' {
  export function v4(): Promise<IDefaultGatewayInfo>;
}
declare module 'default-gateway/freebsd' {
  export function v4(): Promise<IDefaultGatewayInfo>;
}
declare module 'default-gateway/linux' {
  export function v4(): Promise<IDefaultGatewayInfo>;
}
declare module 'default-gateway/openbsd' {
  export function v4(): Promise<IDefaultGatewayInfo>;
}
declare module 'default-gateway/sunos' {
  export function v4(): Promise<IDefaultGatewayInfo>;
}
declare module 'default-gateway/win32' {
  export function v4(): Promise<IDefaultGatewayInfo>;
}
