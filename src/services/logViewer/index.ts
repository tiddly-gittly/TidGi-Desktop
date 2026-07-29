import { LOG_FOLDER } from '@/constants/appPaths';
import { type LogProcess, type LogRecord, logRecordSchema, type LogScope } from '@services/libs/log/schema';
import { injectable } from 'inversify';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ILogEntryReference, ILogEntrySummary, ILogPage, ILogPageCursor, ILogSource, ILogViewerService } from './interface';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FILE_PATTERN = /^(.*?)(?:\.(\d+))?\.log$/;
const READ_BLOCK_SIZE = 64 * 1024;

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
    } catch {
      return [];
    }
  }

  public async listSources(date: string): Promise<ILogSource[]> {
    if (!DATE_PATTERN.test(date)) throw new Error('Invalid log date');
    const sources: ILogSource[] = [];
    const addDirectory = async (directory: string, scope: LogScope) => {
      let files: string[];
      try {
        files = await fs.readdir(directory);
      } catch {
        return;
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
    } catch {
      // No workspace logs for this date.
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
      const leftIndex = Number(FILE_PATTERN.exec(left)?.[2] ?? Number.MAX_SAFE_INTEGER);
      const rightIndex = Number(FILE_PATTERN.exec(right)?.[2] ?? Number.MAX_SAFE_INTEGER);
      return rightIndex - leftIndex;
    }).map(file => path.join(base, file));
  }

  private async readFilePage(relativePath: string, offset: number | undefined, limit: number): Promise<{ entries: ILogEntrySummary[]; nextOffset: number }> {
    const absolutePath = this.resolveRelative(relativePath);
    const handle = await fs.open(absolutePath, 'r');
    try {
      const stat = await handle.stat();
      let position = Math.min(offset ?? stat.size, stat.size);
      const chunks: Buffer[] = [];
      let newlineCount = 0;
      while (position > 0 && newlineCount <= limit) {
        const length = Math.min(READ_BLOCK_SIZE, position);
        position -= length;
        const buffer = Buffer.allocUnsafe(length);
        await handle.read(buffer, 0, length, position);
        chunks.unshift(buffer);
        for (const byte of buffer) if (byte === 10) newlineCount++;
      }
      const combined = Buffer.concat(chunks);
      const lineRanges: Array<{ start: number; end: number }> = [];
      let lineStart = 0;
      for (let index = 0; index <= combined.length; index++) {
        if (index === combined.length || combined[index] === 10) {
          if (index > lineStart && (position === 0 || lineStart > 0)) {
            lineRanges.push({ start: lineStart, end: index });
          }
          lineStart = index + 1;
        }
      }
      const selected = lineRanges.slice(-limit);
      const entries: ILogEntrySummary[] = [];
      for (const range of selected) {
        const line = combined.subarray(range.start, range.end).toString('utf8').replace(/\r$/, '');
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
          relativePath,
          start: position + range.start,
          length: range.end - range.start,
        };
        entries.push(summary(parsed.data, reference));
      }
      return {
        entries,
        nextOffset: selected.length === 0 ? 0 : position + selected[0].start,
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
    const handle = await fs.open(this.resolveRelative(reference.relativePath), 'r');
    try {
      const buffer = Buffer.allocUnsafe(reference.length);
      await handle.read(buffer, 0, reference.length, reference.start);
      return logRecordSchema.parse(JSON.parse(buffer.toString('utf8').replace(/\r$/, '')) as unknown);
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
      for (const entry of page.entries) {
        if (levels !== undefined && !levels.includes(entry.level)) continue;
        const full = await this.readEntry(entry.ref);
        if (`${full.message}\n${JSON.stringify(full.meta)}`.toLocaleLowerCase().includes(normalized)) results.push(entry);
        if (results.length >= 1000) return results;
      }
      cursor = page.nextCursor;
    } while (cursor !== undefined);
    return results;
  }
}
