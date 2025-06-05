/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable unicorn/prevent-abbreviations */
import type {} from '@mui/system';
import type {} from '@mui/types';

declare module 'errio' {
  export function parse(error: Error): Error;
  export function stringify(error: Error): string;
  export function register(error: ErrorConstructor): void;
}

declare module 'espree' {
  // https://github.com/eslint/espree#options
  export interface Options {
    comment?: boolean;
    ecmaFeatures?: {
      globalReturn?: boolean;
      impliedStrict?: boolean;
      jsx?: boolean;
    };
    ecmaVersion?:
      | 3
      | 5
      | 6
      | 7
      | 8
      | 9
      | 10
      | 11
      | 12
      | 2015
      | 2016
      | 2017
      | 2018
      | 2019
      | 2020
      | 2021
      | 2022
      | 'latest';
    loc?: boolean;
    range?: boolean;
    sourceType?: 'script' | 'module';
    tokens?: boolean;
  }
  // https://github.com/eslint/espree#options
  export function parse(code: string, options?: Options): any;
  // https://github.com/eslint/espree#tokenize
  export function tokenize(code: string, options?: Options): any;
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
