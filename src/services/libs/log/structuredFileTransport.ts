import { LOG_FOLDER } from '@/constants/appPaths';
import { format as formatDate } from 'date-fns';
import type { TransformableInfo } from 'logform';
import { nanoid } from 'nanoid';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createStream, type RotatingFileStream } from 'rotating-file-stream';
import Transport from 'winston-transport';
import { GLOBAL_MAIN_LOG_CONTEXT, type LogContext, logContextSchema, logLevelSchema, type LogRecord } from './schema';

const RETENTION_DAYS = 14;
const LOG_SIZE = '20M';
const streams = new Map<string, RotatingFileStream>();

function safeSegment(value: string): string {
  const normalized = value.trim().replaceAll(/[^a-zA-Z0-9._-]/g, '-').replaceAll(/-+/g, '-');
  return normalized || 'unknown';
}

function routeSegments(context: LogContext): string[] {
  const component = safeSegment(context.component ?? context.process);
  if (context.scope.kind === 'workspace') {
    return ['workspaces', safeSegment(context.scope.workspaceID), component];
  }
  return ['global', component];
}

function streamKey(context: LogContext): string {
  return routeSegments(context).join('/');
}

function getStream(context: LogContext): RotatingFileStream {
  const key = streamKey(context);
  const existing = streams.get(key);
  if (existing !== undefined) return existing;

  const route = routeSegments(context);
  const baseName = route.pop()!;
  const stream = createStream(
    (time, index) => {
      const date = formatDate(time ?? new Date(), 'yyyy-MM-dd');
      const suffix = index === undefined || index === 0 ? '' : `.${index}`;
      return path.join(date, ...route, `${baseName}${suffix}.log`);
    },
    {
      path: LOG_FOLDER,
      size: LOG_SIZE,
      interval: '1d',
      intervalBoundary: true,
    },
  );
  streams.set(key, stream);
  return stream;
}

function normalizeMeta(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    return value.map(item => normalizeMeta(item, seen));
  }
  if (value !== null && typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      try {
        result[key] = normalizeMeta(nested, seen);
      } catch {
        result[key] = '[Unserializable]';
      }
    }
    return result;
  }
  return value;
}

export async function cleanupExpiredLogFolders(now = new Date()): Promise<void> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(LOG_FOLDER, { withFileTypes: true });
  } catch {
    return;
  }
  const oldest = new Date(now);
  oldest.setHours(0, 0, 0, 0);
  oldest.setDate(oldest.getDate() - RETENTION_DAYS + 1);
  await Promise.all(
    entries.filter(entry => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name)).map(async entry => {
      const date = new Date(`${entry.name}T00:00:00`);
      if (!Number.isNaN(date.valueOf()) && date < oldest) {
        await fs.rm(path.join(LOG_FOLDER, entry.name), { recursive: true, force: true });
      }
    }),
  );
}

export default class StructuredFileTransport extends Transport {
  public log(info: TransformableInfo, callback: () => void): void {
    setImmediate(() => this.emit('logged', info));
    const contextResult = logContextSchema.safeParse(info.logContext);
    const context = contextResult.success ? contextResult.data : GLOBAL_MAIN_LOG_CONTEXT;
    const levelResult = logLevelSchema.safeParse(info.level);
    const level = levelResult.success ? levelResult.data : 'info';
    const meta: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(info)) {
      if (!['level', 'message', 'timestamp', 'logContext'].includes(key)) {
        meta[key] = normalizeMeta(value);
      }
    }
    const record: LogRecord = {
      version: 1,
      id: nanoid(),
      timestamp: typeof info.timestamp === 'string' ? info.timestamp : new Date().toISOString(),
      level,
      message: typeof info.message === 'string' ? info.message : String(info.message),
      process: context.process,
      scope: context.scope,
      component: context.component,
      pid: context.pid ?? process.pid,
      meta,
    };
    getStream(context).write(`${JSON.stringify(record)}\n`, callback);
  }
}

export async function closeStructuredLogStreams(): Promise<void> {
  await Promise.all([...streams.values()].map(stream => new Promise<void>(resolve => stream.end(resolve))));
  streams.clear();
}
