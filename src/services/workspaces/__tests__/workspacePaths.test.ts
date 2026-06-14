import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  getWorkspaceGitScope,
  getWorkspaceType,
  isHtmlWikiWorkspace,
  normalizeHtmlWorkspacePaths,
} from '@services/workspaces/workspacePaths';
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
    const normalized = normalizeHtmlWorkspacePaths('/data/my.wiki.html');
    expect(normalized.htmlFileLocation).toBe(path.resolve('/data/my.wiki.html'));
    expect(normalized.wikiFolderLocation).toBe(path.resolve('/data'));
  });

  it('scopes git to a single html file', () => {
    const workspace = {
      id: 'w1',
      name: 'demo',
      active: false,
      order: 0,
      picturePath: null,
      wikiFolderLocation: '/data',
      workspaceType: WorkspaceType.html,
      htmlFileLocation: '/data/my.wiki.html',
    };
    expect(getWorkspaceGitScope(workspace)).toEqual({
      repoPath: path.resolve('/data'),
      managedRelativePath: 'my.wiki.html',
      managedAbsolutePath: path.resolve('/data/my.wiki.html'),
      managedDisplayName: 'my.wiki.html',
    });
  });
});
