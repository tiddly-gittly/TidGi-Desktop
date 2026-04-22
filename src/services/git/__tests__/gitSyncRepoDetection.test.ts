// @vitest-environment node

import * as os from 'node:os';
import * as path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { exec as gitExec } from 'dugite';
import { hasGit } from 'git-sync-js/dist/src/inspect.js';

describe('git-sync-js repo detection compatibility', () => {
  it('treats Windows path format differences and benign stderr as a valid git repository', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'tidgi-git-detect-'));

    try {
      const initResult = await gitExec(['init', '--initial-branch=main'], tempRoot);
      expect(initResult.exitCode).toBe(0);

      const originalTrace = process.env.GIT_TRACE;
      process.env.GIT_TRACE = '1';

      try {
        const posixStylePath = tempRoot.replaceAll('\\', '/');
        await expect(hasGit(posixStylePath)).resolves.toBe(true);
      } finally {
        if (originalTrace === undefined) {
          delete process.env.GIT_TRACE;
        } else {
          process.env.GIT_TRACE = originalTrace;
        }
      }
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});