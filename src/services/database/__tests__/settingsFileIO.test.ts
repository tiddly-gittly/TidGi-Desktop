import fs from 'fs-extra';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeSettingsFile } from '../settingsFileIO';

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

  it.runIf(process.platform !== 'win32')('keeps the final concurrent value private', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'tidgi-settings-concurrent-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'settings.json');

    // DatabaseService serializes these calls; emulate that queue while proving
    // every atomic replacement retains the restrictive mode.
    await writeSettingsFile(filePath, { revision: 1 }, process.platform);
    await writeSettingsFile(filePath, { revision: 2, unknown: 'kept' }, process.platform);

    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual({ revision: 2, unknown: 'kept' });
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
  });
});
