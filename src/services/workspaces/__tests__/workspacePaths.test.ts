import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { computeGitScopePaths, getWorkspaceGitScope, getWorkspaceType, isHtmlWikiWorkspace, normalizeHtmlWorkspacePaths } from '@services/workspaces/workspacePaths';
import { WorkspaceType } from '@services/workspaces/workspaceType';

// Build cross-platform absolute paths so path.resolve behaves identically on Linux/Windows CI.
const gameRoot = path.resolve('/tmp/projects/game').replace(/\\/g, '/');
const wikiFolder = path.resolve('/tmp/projects/game/wiki').replace(/\\/g, '/');
const mywikiFolder = path.resolve('/tmp/projects/game/mywiki').replace(/\\/g, '/');

describe('workspacePaths', () => {
  it('detects html workspace type', () => {
    const workspace = {
      id: 'w1',
      name: 'demo',
      active: false,
      order: 0,
      picturePath: null,
      wikiFolderLocation: '/tmp',
      workspaceType: WorkspaceType.html,
      htmlFileLocation: '/tmp/demo.html',
    };
    expect(getWorkspaceType(workspace)).toBe(WorkspaceType.html);
    expect(isHtmlWikiWorkspace(workspace)).toBe(true);
  });

  it('rejects a workspace without its canonical type', () => {
    const workspace = {
      id: 'w1',
      name: 'demo',
      active: false,
      order: 0,
      picturePath: null,
      wikiFolderLocation: '/tmp/wiki',
    };
    expect(() => getWorkspaceType(workspace)).toThrow('workspace_invalid_workspace_type');
  });

  it('normalizes html workspace paths', () => {
    const normalized = normalizeHtmlWorkspacePaths('C:\\data\\my.wiki.html');
    expect(normalized.htmlFileLocation).toBe('C:/data/my.wiki.html');
    expect(normalized.wikiFolderLocation).toBe('C:/data');
  });

  it('scopes git to a single html file', () => {
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
    expect(getWorkspaceGitScope(workspace)).toEqual({
      repoPath: 'C:/data',
      managedRelativePath: 'my.wiki.html',
      managedAbsolutePath: 'C:/data/my.wiki.html',
      managedDisplayName: 'my.wiki.html',
      isSingleFileScope: true,
    });
  });

  it('uses the wiki folder as the repo when gitRepoPath is unset', () => {
    const workspace = {
      id: 'w1',
      name: 'demo',
      active: false,
      order: 0,
      picturePath: null,
      wikiFolderLocation: 'C:\\projects\\game\\wiki',
      workspaceType: WorkspaceType.folder,
      gitRepoPath: null,
      gitManagedRelativePath: null,
    };
    const scope = getWorkspaceGitScope(workspace);
    expect(scope?.repoPath).toBe('C:/projects/game/wiki');
    expect(scope?.managedRelativePath).toBeUndefined();
  });

  it('scopes git to an ancestor repo when gitRepoPath is configured', () => {
    const workspace = {
      id: 'w1',
      name: 'demo',
      active: false,
      order: 0,
      picturePath: null,
      wikiFolderLocation: wikiFolder,
      workspaceType: WorkspaceType.folder,
      gitRepoPath: '..',
      gitManagedRelativePath: 'wiki',
    };
    const scope = getWorkspaceGitScope(workspace);
    expect(scope?.repoPath).toBe(gameRoot);
    expect(scope?.managedRelativePath).toBe('wiki');
    expect(scope?.managedAbsolutePath).toBe(wikiFolder);
  });

  it('defaults managedRelativePath to the wiki folder name when only gitRepoPath is set', () => {
    const workspace = {
      id: 'w1',
      name: 'demo',
      active: false,
      order: 0,
      picturePath: null,
      wikiFolderLocation: mywikiFolder,
      workspaceType: WorkspaceType.folder,
      gitRepoPath: '..',
    };
    const scope = getWorkspaceGitScope(workspace);
    expect(scope?.repoPath).toBe(gameRoot);
    expect(scope?.managedRelativePath).toBe('mywiki');
  });

  it('marks html scope as single-file and folder scope as non-single-file', () => {
    const htmlWorkspace = {
      id: 'w1',
      name: 'demo',
      active: false,
      order: 0,
      picturePath: null,
      wikiFolderLocation: 'C:\\data',
      workspaceType: WorkspaceType.html,
      htmlFileLocation: 'C:\\data\\my.wiki.html',
    };
    expect(getWorkspaceGitScope(htmlWorkspace)?.isSingleFileScope).toBe(true);

    const folderWorkspace = {
      id: 'w2',
      name: 'demo',
      active: false,
      order: 0,
      picturePath: null,
      wikiFolderLocation: 'C:\\projects\\game\\wiki',
      workspaceType: WorkspaceType.folder,
      gitRepoPath: '..',
      gitManagedRelativePath: 'wiki',
    };
    expect(getWorkspaceGitScope(folderWorkspace)?.isSingleFileScope).toBe(false);
  });
});

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
