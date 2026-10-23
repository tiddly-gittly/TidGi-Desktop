import { LOG_FOLDER } from '@/constants/appPaths';
import { type LogProcess, type LogRecord, logRecordSchema, type LogScope } from '@services/libs/log/schema';
import { injectable } from 'inversify';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ILogEntryReference, ILogEntrySummary, ILogPage, ILogPageCursor, ILogSource, ILogViewerService } from './interface';

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && typeof error.code === 'string';
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FILE_PATTERN = /^(.*?)(?:\.(\d+))?\.log$/;
const READ_BLOCK_SIZE = 64 * 1024;
const MAX_ENTRY_SIZE = 1024 * 1024;
const MAX_PAGE_SCAN_BYTES = 16 * 1024 * 1024;
const SEARCH_READ_CONCURRENCY = 8;

async function mapWithConcurrency<T, R>(values: T[], concurrency: number, operation: (value: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await operation(values[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function processFromComponent(component: string): LogProcess {
  if (component === 'git-worker') return 'git-worker';
  if (component === 'wiki-worker') return 'wiki-worker';
  if (component.includes('renderer') || component.startsWith('window-')) return 'renderer';
  return 'main';
}

function summary(record: LogRecord, reference: ILogEntryReference): ILogEntrySummary {
  const commonMetaEntries = Object.entries(record.meta).filter(([key]) => ['function', 'handler', 'callerFunction', 'method', 'worker'].includes(key));
  const graphemes = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(record.message), part => part.segment);
  return {
    ref: reference,
    id: record.id,
    timestamp: record.timestamp,
    level: record.level,
    preview: graphemes.slice(0, 300).join(''),
    messageLength: graphemes.length,
    process: record.process,
    scope: record.scope,
    component: record.component,
    pid: record.pid,
    meta: Object.fromEntries(commonMetaEntries),
  };
}

@injectable()
export class LogViewerService implements ILogViewerService {
  private resolveRelative(relativePath: string): string {
    const resolved = path.resolve(LOG_FOLDER, relativePath);
    const relative = path.relative(LOG_FOLDER, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid log path');
    return resolved;
  }

  public async listDates(): Promise<string[]> {
    try {
      return (await fs.readdir(LOG_FOLDER, { withFileTypes: true }))
        .filter(entry => entry.isDirectory() && DATE_PATTERN.test(entry.name))
        .map(entry => entry.name)
        .sort((left, right) => right.localeCompare(left));
    } catch (error: unknown) {
      const code = isNodeError(error) ? error.code : undefined;
      if (code !== undefined && ['ENOENT', 'ENOTDIR'].includes(code)) return [];
      throw error;
    }
  }

  public async listSources(date: string): Promise<ILogSource[]> {
    if (!DATE_PATTERN.test(date)) throw new Error('Invalid log date');
    const sources: ILogSource[] = [];
    const addDirectory = async (directory: string, scope: LogScope) => {
      let files: string[];
      try {
        files = await fs.readdir(directory);
      } catch (error: unknown) {
        const code = isNodeError(error) ? error.code : undefined;
        if (code !== undefined && ['ENOENT', 'ENOTDIR'].includes(code)) return;
        throw error;
      }
      const components = new Set(files.map(file => FILE_PATTERN.exec(file)?.[1]).filter((value): value is string => value !== undefined));
      for (const component of components) {
        sources.push({
          id: `${scope.kind === 'global' ? 'global' : scope.workspaceID}:${component}`,
          date,
          scope,
          process: processFromComponent(component),
          component,
          label: component,
        });
      }
    };

    await addDirectory(path.join(LOG_FOLDER, date, 'global'), { kind: 'global' });
    const workspaceRoot = path.join(LOG_FOLDER, date, 'workspaces');
    let workspaceDirectories: string[] = [];
    try {
      workspaceDirectories = (await fs.readdir(workspaceRoot, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name);
    } catch (error: unknown) {
      const code = isNodeError(error) ? error.code : undefined;
      if (code === undefined || !['ENOENT', 'ENOTDIR'].includes(code)) throw error;
    }
    await Promise.all(workspaceDirectories.map(async workspaceID => {
      await addDirectory(path.join(workspaceRoot, workspaceID), { kind: 'workspace', workspaceID });
    }));
    return sources.sort((left, right) => left.id.localeCompare(right.id));
  }

  private async sourceFiles(source: ILogSource): Promise<string[]> {
    const base = source.scope.kind === 'global'
      ? path.join(source.date, 'global')
      : path.join(source.date, 'workspaces', source.scope.workspaceID);
    const directory = this.resolveRelative(base);
    const files = (await fs.readdir(directory)).filter(file => {
      const match = FILE_PATTERN.exec(file);
      return match?.[1] === source.component;
    });
    return files.sort((left, right) => {
      const leftIndex = Number(FILE_PATTERN.exec(left)?.[2] ?? 0);
      const rightIndex = Number(FILE_PATTERN.exec(right)?.[2] ?? 0);
      return rightIndex - leftIndex;
    }).map(file => path.join(base, file));
  }

  private async readFilePage(relativePath: string, offset: number | undefined, limit: number): Promise<{ entries: ILogEntrySummary[]; nextOffset: number }> {
    const absolutePath = this.resolveRelative(relativePath);
    const handle = await fs.open(absolutePath, 'r');
    try {
      const stat = await handle.stat();
      let scanPosition = Math.min(offset ?? stat.size, stat.size);
      const initialPosition = scanPosition;
      let lineEnd = scanPosition;
      let scannedBytes = 0;
      const lineRanges: Array<{ start: number; end: number }> = [];
      while (scanPosition > 0 && lineRanges.length < limit && scannedBytes < MAX_PAGE_SCAN_BYTES) {
        const length = Math.min(READ_BLOCK_SIZE, scanPosition, MAX_PAGE_SCAN_BYTES - scannedBytes);
        scanPosition -= length;
        scannedBytes += length;
        const buffer = Buffer.allocUnsafe(length);
        await handle.read(buffer, 0, length, scanPosition);
        for (let index = buffer.length - 1; index >= 0; index--) {
          if (buffer[index] !== 10) continue;
          const newlinePosition = scanPosition + index;
          if (newlinePosition === lineEnd - 1) {
            lineEnd = newlinePosition;
            continue;
          }
          const lineStart = newlinePosition + 1;
          const lineLength = lineEnd - lineStart;
          if (lineLength > 0 && lineLength <= MAX_ENTRY_SIZE) {
            lineRanges.push({ start: lineStart, end: lineEnd });
          }
          // Oversized records are deliberately skipped without allocating them.
          lineEnd = newlinePosition;
          if (lineRanges.length >= limit) break;
        }
      }
      if (scanPosition === 0 && lineRanges.length < limit) {
        if (lineEnd > 0 && lineEnd <= MAX_ENTRY_SIZE) {
          lineRanges.push({ start: 0, end: lineEnd });
        }
        lineEnd = 0;
      }
      const entries: ILogEntrySummary[] = [];
      for (const range of lineRanges.reverse()) {
        const buffer = Buffer.allocUnsafe(range.end - range.start);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, range.start);
        if (bytesRead !== buffer.length) continue;
        const line = buffer.toString('utf8').replace(/\r$/, '');
        let json: unknown;
        try {
          json = JSON.parse(line) as unknown;
        } catch {
          // A process may be interrupted while appending a record. Ignore that
          // incomplete line and continue rendering the surrounding valid data.
          continue;
        }
        const parsed = logRecordSchema.safeParse(json);
        if (!parsed.success) continue;
        const reference = {
          expectedID: parsed.data.id,
          relativePath,
          start: range.start,
          length: range.end - range.start,
        };
        entries.push(summary(parsed.data, reference));
      }
      return {
        entries,
        nextOffset: lineEnd === initialPosition ? scanPosition : lineEnd,
      };
    } finally {
      await handle.close();
    }
  }

  public async readPage(source: ILogSource, cursor: ILogPageCursor = { fileIndex: 0 }, limit = 500): Promise<ILogPage> {
    const files = await this.sourceFiles(source);
    const boundedLimit = Math.max(1, Math.min(limit, 1000));
    const entries: ILogEntrySummary[] = [];
    let fileIndex = cursor.fileIndex;
    let offset = cursor.offset;
    while (fileIndex < files.length && entries.length < boundedLimit) {
      const page = await this.readFilePage(files[fileIndex], offset, boundedLimit - entries.length);
      entries.unshift(...page.entries);
      if (page.nextOffset > 0) {
        return { entries, nextCursor: { fileIndex, offset: page.nextOffset } };
      }
      fileIndex++;
      offset = undefined;
    }
    return { entries, ...(fileIndex < files.length ? { nextCursor: { fileIndex } } : {}) };
  }

  public async readEntry(reference: ILogEntryReference): Promise<LogRecord> {
    if (
      !Number.isSafeInteger(reference.start) ||
      !Number.isSafeInteger(reference.length) ||
      reference.start < 0 ||
      reference.length <= 0 ||
      reference.length > MAX_ENTRY_SIZE
    ) {
      throw new Error('Invalid log entry range');
    }
    const handle = await fs.open(this.resolveRelative(reference.relativePath), 'r');
    try {
      const stat = await handle.stat();
      if (reference.start > stat.size || reference.length > stat.size - reference.start) {
        throw new Error('Log entry range is outside the file');
      }
      const buffer = Buffer.allocUnsafe(reference.length);
      const { bytesRead } = await handle.read(buffer, 0, reference.length, reference.start);
      if (bytesRead !== reference.length) throw new Error('Log entry changed while it was being read');
      const record = logRecordSchema.parse(JSON.parse(buffer.toString('utf8').replace(/\r$/, '')) as unknown);
      if (reference.expectedID !== undefined && record.id !== reference.expectedID) {
        throw new Error('Log entry changed after it was listed');
      }
      return record;
    } finally {
      await handle.close();
    }
  }

  public async search(source: ILogSource, query: string, levels?: LogRecord['level'][]): Promise<ILogEntrySummary[]> {
    const normalized = query.trim().toLocaleLowerCase();
    if (normalized.length === 0) return [];
    const results: ILogEntrySummary[] = [];
    let cursor: ILogPageCursor | undefined;
    do {
      const page = await this.readPage(source, cursor, 1000);
      const candidates = levels === undefined ? page.entries : page.entries.filter(entry => levels.includes(entry.level));
      const pageMatches = await mapWithConcurrency(candidates, SEARCH_READ_CONCURRENCY, async entry => {
        const full = await this.readEntry(entry.ref);
        return `${full.message}\n${JSON.stringify(full.meta)}`.toLocaleLowerCase().includes(normalized) ? entry : undefined;
      });
      for (const entry of pageMatches) {
        if (entry === undefined) continue;
        results.push(entry);
        if (results.length >= 1000) return results;
      }
      cursor = page.nextCursor;
    } while (cursor !== undefined);
    return results;
  }
}
