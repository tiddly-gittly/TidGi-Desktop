import { describe, expect, it } from 'vitest';

import { getWorkspaceGitScope, getWorkspaceType, isHtmlWikiWorkspace, normalizeHtmlWorkspacePaths } from '@services/workspaces/workspacePaths';
import { WorkspaceType } from '@services/workspaces/workspaceType';

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
});
