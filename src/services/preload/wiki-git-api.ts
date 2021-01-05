/**
 * Provide API from electron to tiddlywiki
 * This file should be required by BrowserView's preload script to work
 */
import { contextBridge } from 'electron';

import { container } from '@services/container';
import { getModifiedFileList } from '@services/git/inspect';
import { Git } from '@services/git';
import { Workspace } from '@services/workspaces';
import { Authentication } from '@services/auth';

contextBridge.exposeInMainWorld('git', {
  getModifiedFileList,
  commitAndSync: (wikiPath: string, githubRepoUrl: string) => {
    const gitService = container.resolve(Git);
    const authService = container.resolve(Authentication);
    const userInfo = authService.get('authing');
    if (userInfo !== undefined) {
      return gitService.commitAndSync(wikiPath, githubRepoUrl, userInfo);
    }
  },
  getWorkspacesAsList: () => {
    const workspaceService = container.resolve(Workspace);
    return workspaceService.getWorkspacesAsList();
  },
});
