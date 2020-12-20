/**
 * Provide API from electron to tiddlywiki
 * This file should be required by BrowserView's preload script to work
 */
import { contextBridge } from 'electron';
import { getModifiedFileList } from './inspect';
import { commitAndSync } from './sync';
import { getWorkspacesAsList } from '../workspaces';
import { getPreference } from '../preferences';

contextBridge.exposeInMainWorld('git', {
  getModifiedFileList,
  commitAndSync: (wikiPath: any, githubRepoUrl: any) => {
    const userInfo = getPreference('github-user-info');
    return commitAndSync(wikiPath, githubRepoUrl, userInfo);
  },
  getWorkspacesAsList,
});
