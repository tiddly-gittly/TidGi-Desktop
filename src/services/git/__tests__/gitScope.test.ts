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

  describe('directory scope (folder wiki inside ancestor repo)', () => {
    it('filters files inside the managed directory and the directory itself', () => {
      const files = filterFilesByScope(
        [
          { path: 'wiki/tiddlywiki.info', status: 'modified' },
          { path: 'wiki/tiddlers/x.tid', status: 'modified' },
          { path: 'README.md', status: 'modified' },
          { path: 'wiki-notes.txt', status: 'modified' },
        ],
        { managedRelativePath: 'wiki' },
      );
      expect(files.map((f) => f.path)).toEqual(['wiki/tiddlywiki.info', 'wiki/tiddlers/x.tid']);
    });

    it('does not match sibling files that only share a name prefix', () => {
      const files = filterFilesByScope(
        [{ path: 'wiki-backup/tiddlers/x.tid', status: 'modified' }],
        { managedRelativePath: 'wiki' },
      );
      expect(files).toEqual([]);
    });

    it('detects uncommitted changes inside the managed directory', () => {
      const status = ' M README.md\n M wiki/tiddlers/x.tid\n';
      expect(hasUncommittedChangesInScope(status, { managedRelativePath: 'wiki' })).toBe(true);
    });

    it('returns false when changes are only outside the managed directory', () => {
      const status = ' M README.md\n M wiki-backup/x.tid\n';
      expect(hasUncommittedChangesInScope(status, { managedRelativePath: 'wiki' })).toBe(false);
    });
  });
});
