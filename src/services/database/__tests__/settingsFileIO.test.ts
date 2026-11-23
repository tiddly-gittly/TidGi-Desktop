import fs from 'fs-extra';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SettingsWriteQueue, writeSettingsFile } from '../settingsFileIO';

const temporaryDirectories: string[] = [];

describe('writeSettingsFile', () => {
  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map(directory => fs.remove(directory)));
  });

  it.runIf(process.platform !== 'win32')('atomically replaces settings with mode 0600 and preserves unknown fields', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'tidgi-settings-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'settings.json');
    const settings = {
      known: { enabled: true },
      unknownFutureField: { nested: ['preserve-me'] },
    };

    await writeSettingsFile(filePath, settings, process.platform);

    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual(settings);
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
    expect((await fs.readdir(directory)).filter(name => name.endsWith('.tmp'))).toEqual([]);
  });

  it('serializes overlapping writes and persists the newest complete settings', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'tidgi-settings-concurrent-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'settings.json');

    const queue = new SettingsWriteQueue();
    const settings = { preferences: { revision: 1 }, unknownFutureField: { preserve: true } };
    const firstStarted = Promise.withResolvers<undefined>();
    const releaseFirst = Promise.withResolvers<undefined>();
    let secondStarted = false;

    const firstWrite = queue.enqueue(async () => {
      const snapshot = structuredClone(settings);
      firstStarted.resolve(undefined);
      await releaseFirst.promise;
      await writeSettingsFile(filePath, snapshot);
    });
    await firstStarted.promise;
    settings.preferences.revision = 2;
    const secondWrite = queue.enqueue(async () => {
      secondStarted = true;
      await writeSettingsFile(filePath, settings);
    });

    // Give an incorrectly concurrent queue a chance to start the newer write.
    await Promise.resolve();
    try {
      expect(secondStarted).toBe(false);
    } finally {
      releaseFirst.resolve(undefined);
      await Promise.all([firstWrite, secondWrite]);
    }
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual(settings);
  });
});
