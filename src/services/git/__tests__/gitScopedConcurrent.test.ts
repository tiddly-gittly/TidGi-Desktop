// @vitest-environment node

import { exec as gitExec } from 'dugite';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { discardFileChanges, getCommitFiles, getFileDiff, getGitLog } from '../gitOperations';

describe('concurrent Git history reads', () => {
  it('reports real edits without refreshing the index while reading touched files', async () => {
    const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'tidgi-git-history-'));
    try {
      const git = async (arguments_: string[]) => {
        const result = await gitExec(arguments_, repoPath);
        expect(result.exitCode, result.stderr).toBe(0);
        return result;
      };
      await git(['init']);
      await git(['config', 'user.email', 'test@example.com']);
      await git(['config', 'user.name', 'Test User']);
      await fs.writeFile(path.join(repoPath, 'wiki.html'), '<html>unchanged</html>\n');
      await fs.writeFile(path.join(repoPath, 'edited.txt'), 'original\n');
      await git(['add', 'wiki.html', 'edited.txt']);
      await git(['commit', '-m', 'initial']);

      const indexPath = path.join(repoPath, '.git', 'index');
      const originalIndex = await fs.readFile(indexPath);
      // Change stat data without changing content: ordinary status/diff refreshes
      // this entry and writes index.lock even though the file is still clean.
      const touchedFile = path.join(repoPath, 'wiki.html');
      const originalStat = await fs.stat(touchedFile);
      await fs.utimes(touchedFile, originalStat.atime, new Date(originalStat.mtimeMs - 60_000));
      await fs.writeFile(path.join(repoPath, 'edited.txt'), 'real edit\n');

      const [cleanLog, editedLog, files, cleanDiff, editedDiff] = await Promise.all([
        getGitLog(repoPath, { scopedPath: 'wiki.html' }),
        getGitLog(repoPath, { scopedPath: 'edited.txt' }),
        getCommitFiles(repoPath, ''),
        getFileDiff(repoPath, '', 'wiki.html'),
        getFileDiff(repoPath, '', 'edited.txt'),
        // A no-op discard only queries status; actual discards still need locks.
        discardFileChanges(repoPath, 'wiki.html'),
      ]);

      expect(cleanLog.entries.map(entry => entry.message)).toEqual(['initial']);
      expect(editedLog.entries[0].hash).toBe('');
      expect(files).toEqual([{ path: 'edited.txt', status: 'modified' }]);
      expect(cleanDiff.content).toBe('');
      expect(editedDiff.content).toContain('-original');
      expect(editedDiff.content).toContain('+real edit');
      expect(await fs.readFile(indexPath)).toEqual(originalIndex);
    } finally {
      await fs.rm(repoPath, { recursive: true, force: true });
    }
  });
});
