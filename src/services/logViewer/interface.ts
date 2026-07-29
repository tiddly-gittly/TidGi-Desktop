import { LogViewerChannel } from '@/constants/channels';
import type { LogLevel, LogProcess, LogRecord, LogScope } from '@services/libs/log/schema';
import { ProxyPropertyType } from 'electron-ipc-cat/common';

export interface ILogSource {
  id: string;
  date: string;
  scope: LogScope;
  process: LogProcess;
  component: string;
  label: string;
}

export interface ILogEntryReference {
  relativePath: string;
  start: number;
  length: number;
}

export interface ILogEntrySummary {
  ref: ILogEntryReference;
  id: string;
  timestamp: string;
  level: LogLevel;
  preview: string;
  messageLength: number;
  process: LogProcess;
  scope: LogScope;
  component?: string;
  pid: number;
  meta: Record<string, unknown>;
}

export interface ILogPageCursor {
  fileIndex: number;
  offset?: number;
}

export interface ILogPage {
  entries: ILogEntrySummary[];
  nextCursor?: ILogPageCursor;
}

export interface ILogViewerService {
  listDates(): Promise<string[]>;
  listSources(date: string): Promise<ILogSource[]>;
  readPage(source: ILogSource, cursor?: ILogPageCursor, limit?: number): Promise<ILogPage>;
  readEntry(reference: ILogEntryReference): Promise<LogRecord>;
  search(source: ILogSource, query: string, levels?: LogLevel[]): Promise<ILogEntrySummary[]>;
}

export const LogViewerServiceIPCDescriptor = {
  channel: LogViewerChannel.name,
  properties: {
    listDates: ProxyPropertyType.Function,
    listSources: ProxyPropertyType.Function,
    readPage: ProxyPropertyType.Function,
    readEntry: ProxyPropertyType.Function,
    search: ProxyPropertyType.Function,
  },
};
