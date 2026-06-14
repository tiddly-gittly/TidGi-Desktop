import { describe, expect, it } from 'vitest';

import { filterFilesByScope, hasUncommittedChangesInScope } from '@services/git/gitScope';

describe('gitScope', () => {
  it('filters file lists to scoped path', () => {
    const files = filterFilesByScope(
      [{ path: 'wiki.html', status: 'modified' }, { path: 'notes.txt', status: 'modified' }],
      { managedRelativePath: 'wiki.html' },
    );
    expect(files).toEqual([{ path: 'wiki.html', status: 'modified' }]);
  });

  it('detects scoped uncommitted changes only', () => {
    const status = ' M notes.txt\n?? wiki.html\n';
    expect(hasUncommittedChangesInScope(status, { managedRelativePath: 'wiki.html' })).toBe(true);
    expect(hasUncommittedChangesInScope(' M notes.txt\n', { managedRelativePath: 'wiki.html' })).toBe(false);
  });
});
