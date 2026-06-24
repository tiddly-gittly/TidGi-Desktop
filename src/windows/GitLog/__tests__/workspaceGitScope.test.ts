import { describe, expect, it } from 'vitest';

import { type IWikiWorkspace, wikiWorkspaceDefaultValues } from '@services/workspaces/interface';
import { WorkspaceType } from '@services/workspaces/workspaceType';
import { getWorkspaceGitLogScope } from '../workspaceGitScope';

describe('workspaceGitScope', () => {
  it('returns single-file scope for html workspaces', () => {
    const workspace: IWikiWorkspace = {
      ...wikiWorkspaceDefaultValues,
      id: 'w1',
      name: 'demo',
      active: false,
      order: 0,
      picturePath: null,
      wikiFolderLocation: '/repo',
      workspaceType: WorkspaceType.html,
      htmlFileLocation: '/repo/wiki.html',
    };
    const scope = getWorkspaceGitLogScope(workspace);
    expect(scope).toMatchObject({
      repoPath: expect.any(String),
      scopedPath: 'wiki.html',
      isSingleFileScope: true,
    });
  });
});
