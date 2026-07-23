import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { getWorkspaceGitScope, getWorkspaceType, isHtmlWikiWorkspace, normalizeHtmlWorkspacePaths } from '@services/workspaces/workspacePaths';
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

  it('defaults legacy workspaces to folder type', () => {
    const workspace = {
      id: 'w1',
      name: 'demo',
      active: false,
      order: 0,
      picturePath: null,
      wikiFolderLocation: '/tmp/wiki',
    };
    expect(getWorkspaceType(workspace)).toBe(WorkspaceType.folder);
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
    });
  });

  it('uses the wiki folder as the repo when gitRepoPath is unset (backward compatible)', () => {
    const workspace = {
      id: 'w1',
      name: 'demo',
      active: false,
      order: 0,
      picturePath: null,
      wikiFolderLocation: 'C:\\projects\\game\\wiki',
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
      gitRepoPath: '..',
    };
    const scope = getWorkspaceGitScope(workspace);
    expect(scope?.repoPath).toBe(gameRoot);
    expect(scope?.managedRelativePath).toBe('mywiki');
  });
});
