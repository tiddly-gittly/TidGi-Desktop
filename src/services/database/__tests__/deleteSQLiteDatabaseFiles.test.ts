import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { deleteSQLiteDatabaseFiles } from '..';

describe('deleteSQLiteDatabaseFiles', () => {
  let temporaryDirectory: string | undefined;

  afterEach(async () => {
    if (temporaryDirectory) {
      await fs.remove(temporaryDirectory);
      temporaryDirectory = undefined;
    }
  });

  it('deletes the database together with WAL and shared-memory sidecars', async () => {
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'tidgi-agent-db-'));
    const databasePath = path.join(temporaryDirectory, 'agent-cache.db');
    const databaseFiles = [databasePath, `${databasePath}-wal`, `${databasePath}-shm`];
    await Promise.all(databaseFiles.map(async filePath => fs.writeFile(filePath, 'stale')));

    await deleteSQLiteDatabaseFiles(databasePath);

    await expect(Promise.all(databaseFiles.map(async filePath => fs.pathExists(filePath)))).resolves.toEqual([false, false, false]);
  });

  it('is safe when some or all database files are already absent', async () => {
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'tidgi-agent-db-'));
    const databasePath = path.join(temporaryDirectory, 'agent-cache.db');
    await fs.writeFile(`${databasePath}-wal`, 'stale');

    await expect(deleteSQLiteDatabaseFiles(databasePath)).resolves.toBeUndefined();
    await expect(fs.pathExists(`${databasePath}-wal`)).resolves.toBe(false);
  });
});
