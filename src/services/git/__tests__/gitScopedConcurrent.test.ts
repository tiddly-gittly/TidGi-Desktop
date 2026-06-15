import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { getGitLog } from '../gitOperations';

const wikiTest = path.join(
  process.cwd(),
  'test-artifacts/HTML workspace git log only shows the managed html file/wiki-test',
);

describe('concurrent scoped getGitLog', () => {
  it('two parallel getGitLog calls complete', async () => {
    const exists = await fs.access(wikiTest).then(() => true).catch(() => false);
    if (!exists) {
      return;
    }

    const start = Date.now();
    const [a, b] = await Promise.all([
      getGitLog(wikiTest, { scopedPath: 'wiki.html' }),
      getGitLog(wikiTest, { scopedPath: 'wiki.html' }),
    ]);
    console.log('parallel elapsed', Date.now() - start, a.entries.length, b.entries.length);
    expect(a.entries.length).toBeGreaterThan(0);
    expect(b.entries.length).toBeGreaterThan(0);
  }, 60_000);
});
