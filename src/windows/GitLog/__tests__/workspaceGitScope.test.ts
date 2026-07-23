import { describe, expect, it } from 'vitest';

import { WorkspaceType } from '@services/workspaces/workspaceType';
import { computeGitScopePaths, getWorkspaceGitLogScope } from '../workspaceGitScope';

describe('workspaceGitScope (renderer)', () => {
  describe('computeGitScopePaths', () => {
    it('computes ../.. scope for a wiki two levels deep', () => {
      const scope = computeGitScopePaths('C:/projects/game/sub/wiki', 'C:/projects/game');
      expect(scope.gitRepoPath).toBe('../..');
      expect(scope.gitManagedRelativePath).toBe('sub/wiki');
    });

    it('computes .. scope for a wiki one level deep', () => {
      const scope = computeGitScopePaths('C:/projects/game/wiki', 'C:/projects/game');
      expect(scope.gitRepoPath).toBe('..');
      expect(scope.gitManagedRelativePath).toBe('wiki');
    });

    it('returns . when the wiki folder is the repo root', () => {
      const scope = computeGitScopePaths('C:/projects/game', 'C:/projects/game');
      expect(scope.gitRepoPath).toBe('.');
      expect(scope.gitManagedRelativePath).toBe('');
    });

    it('handles backslash paths and normalizes them', () => {
      const scope = computeGitScopePaths('C:\\projects\\game\\wiki', 'C:\\projects\\game');
      expect(scope.gitRepoPath).toBe('..');
      expect(scope.gitManagedRelativePath).toBe('wiki');
    });
  });

  describe('getWorkspaceGitLogScope', () => {
    it('resolves to the outer repo for a folder wiki with gitRepoPath set', () => {
      const workspace = {
        id: 'w1',
        name: 'demo',
        active: false,
        order: 0,
        picturePath: null,
        wikiFolderLocation: 'C:\\projects\\game\\wiki',
        gitRepoPath: '..',
        gitManagedRelativePath: 'wiki',
      };
      const scope = getWorkspaceGitLogScope(workspace);
      expect(scope?.repoPath).toBe('C:/projects/game');
      expect(scope?.scopedPath).toBe('wiki');
      expect(scope?.isSingleFileScope).toBe(false);
    });

    it('falls back to the wiki folder when gitRepoPath is unset', () => {
      const workspace = {
        id: 'w1',
        name: 'demo',
        active: false,
        order: 0,
        picturePath: null,
        wikiFolderLocation: 'C:/projects/game/wiki',
        gitRepoPath: null,
        gitManagedRelativePath: null,
      };
      const scope = getWorkspaceGitLogScope(workspace);
      expect(scope?.repoPath).toBe('C:/projects/game/wiki');
      expect(scope?.scopedPath).toBeUndefined();
    });

    it('scopes html wiki to the single html file', () => {
      const workspace = {
        id: 'w1',
        name: 'demo',
        active: false,
        order: 0,
        picturePath: null,
        wikiFolderLocation: 'C:\\data',
        workspaceType: WorkspaceType.html,
        htmlFileLocation: 'C:\\data\\my.wiki.html',
      };
      const scope = getWorkspaceGitLogScope(workspace);
      expect(scope?.repoPath).toBe('C:/data');
      expect(scope?.scopedPath).toBe('my.wiki.html');
      expect(scope?.isSingleFileScope).toBe(true);
    });
  });
});
