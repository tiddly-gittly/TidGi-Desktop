import { LOG_FOLDER } from '@/constants/appPaths';
import type { LogRecord } from '@services/libs/log/schema';
import fs from 'fs-extra';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LogViewerService } from '..';
import type { ILogSource } from '../interface';

const date = '2099-01-01';
const workspaceID = 'log-viewer-test-workspace';
const directory = path.join(LOG_FOLDER, date, 'workspaces', workspaceID);
const filePath = path.join(directory, 'wiki-worker.log');
const source: ILogSource = {
  id: `${workspaceID}:wiki-worker`,
  date,
  scope: { kind: 'workspace', workspaceID },
  process: 'wiki-worker',
  component: 'wiki-worker',
  label: 'wiki-worker',
};

function record(id: string, message: string, level: LogRecord['level'] = 'info'): LogRecord {
  return {
    version: 1,
    id,
    timestamp: '2099-01-01T00:00:00.000Z',
    level,
    message,
    process: 'wiki-worker',
    scope: { kind: 'workspace', workspaceID },
    component: 'wiki-worker',
    pid: 123,
    meta: { function: 'testReader', nested: { searchable: 'needle' } },
  };
}

describe('LogViewerService', () => {
  beforeAll(async () => {
    await fs.ensureDir(directory);
    const longMessage = `${'界'.repeat(305)} family: 👨‍👩‍👧‍👦`;
    await fs.writeFile(filePath, `${JSON.stringify(record('first', longMessage))}\n${JSON.stringify(record('second', 'error message', 'error'))}\n`);
  });

  afterAll(async () => {
    await fs.remove(path.join(LOG_FOLDER, date));
  });

  it('lists workspace process sources from the date directory', async () => {
    const service = new LogViewerService();
    await expect(service.listDates()).resolves.toContain(date);
    await expect(service.listSources(date)).resolves.toContainEqual(source);
  });

  it('reads summaries from the tail and loads full entries on demand', async () => {
    const service = new LogViewerService();
    const page = await service.readPage(source, undefined, 10);
    expect(page.entries.map(entry => entry.id)).toEqual(['first', 'second']);
    expect(page.entries[0].preview).toHaveLength(300);
    expect(page.entries[0].messageLength).toBe(315);
    await expect(service.readEntry(page.entries[1].ref)).resolves.toMatchObject({ id: 'second', message: 'error message' });
  });

  it('searches full messages and metadata rather than summaries only', async () => {
    const service = new LogViewerService();
    await expect(service.search(source, 'needle')).resolves.toHaveLength(2);
    await expect(service.search(source, 'error message', ['error'])).resolves.toMatchObject([{ id: 'second' }]);
    await expect(service.search(source, 'error message', ['info'])).resolves.toEqual([]);
  });

  it('rejects paths outside the log root', async () => {
    const service = new LogViewerService();
    await expect(service.readEntry({ relativePath: '..\\settings.json', start: 0, length: 1 })).rejects.toThrow('Invalid log path');
  });
});
