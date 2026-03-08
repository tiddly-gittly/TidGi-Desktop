// Stub declarations for external modules that don't ship their own types
// or whose types are too heavy to include as dependencies.

declare module 'v8-compile-cache-lib' {
  export const __TEST__: any;
  export function install(options?: any): { uninstall: () => void } | undefined;
  export function uninstall(): void;
}

declare module 'espree' {
  export function parse(code: string, options?: any): any;
  export function tokenize(code: string, options?: any): any;
  export const version: string;
  export const latestEcmaVersion: number;
  export const supportedEcmaVersions: number[];
}

declare module 'git-sync-js' {
  export interface ICommitAndSyncOptions {
    [key: string]: unknown;
  }
  export interface ModifiedFileList {
    filePath: string;
    fileRelativePath: string;
    type: string;
  }
}

declare module 'ai' {
  export interface ModelMessage {
    role: string;
    content: string | Array<{ type: string; [key: string]: unknown }>;
    [key: string]: unknown;
  }
}

declare module 'typeorm' {
  export function Entity(name?: string): ClassDecorator;
  export function Column(options?: Record<string, unknown>): PropertyDecorator;
  export function PrimaryColumn(): PropertyDecorator;
  export function Index(): PropertyDecorator;
  export function CreateDateColumn(): PropertyDecorator;
  export function UpdateDateColumn(): PropertyDecorator;
  export class DataSource {
    [key: string]: unknown;
  }
}
