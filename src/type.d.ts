// `?utilityProcess` import — emits the module as a separate chunk and returns
// a factory that calls `utilityProcess.fork(path)`. See vite.main.config.ts
// `utilityProcessPlugin` for the implementation.
declare module '*?utilityProcess' {
  import type { UtilityProcess } from 'electron';
  export default function forkUtilityProcess(options?: Record<string, unknown>): UtilityProcess;
}

// Electron Forge Vite Plugin 提供的全局变量
// https://www.electronforge.io/config/plugins/vite
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;
declare const MAIN_WINDOW_PRELOAD_VITE_ENTRY: string;

declare module 'errio' {
  export function parse(error: Error): Error;
  export function stringify(error: Error): string;
  export function register(error: ErrorConstructor): void;
}

declare module 'v8-compile-cache-lib' {
  export interface V8CompileCacheTestApi {
    getMainName(): string;
    getCacheDir(): string;
    supportsCachedData(): boolean;
  }

  export const __TEST__: V8CompileCacheTestApi;
  export function install(options?: {
    cacheDir?: string;
    prefix?: string;
  }): {
    uninstall(): void;
  } | undefined;
}

declare module '*.png' {
  const value: string;
  export default value;
}
declare module '*.svg' {
  const value: string;
  export default value;
}

// default-gateway v7 — unified API, no platform-specific sub-paths
declare module 'default-gateway' {
  interface DefaultGatewayInfo {
    gateway: string;
    version: number;
    int: string | null;
  }
  export function gateway4(): Promise<DefaultGatewayInfo>;
  export function gateway6(): Promise<DefaultGatewayInfo>;
  export function gateway4Sync(): DefaultGatewayInfo;
  export function gateway6Sync(): DefaultGatewayInfo;
}

declare module '@modelcontextprotocol/sdk/client/index.js' {
  export const Client: {
    new(info: { name: string; version: string }, options: { capabilities: Record<string, unknown> }): {
      connect(transport: unknown): Promise<void>;
      listTools(): Promise<{ tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> }>;
      callTool(request: { name: string; arguments?: Record<string, unknown> }): Promise<unknown>;
      close?(): Promise<void>;
    };
  };
}

declare module '@modelcontextprotocol/sdk/client/stdio.js' {
  export const StdioClientTransport: {
    new(options: { command: string; args?: string[] }): unknown;
  };
}

declare module '@modelcontextprotocol/sdk/client/sse.js' {
  export const SSEClientTransport: {
    new(url: URL): unknown;
  };
}
