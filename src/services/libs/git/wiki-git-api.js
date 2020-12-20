/**
 * Provide API from electron to tiddlywiki
 * This file should be required by BrowserView's preload script to work
 */
const { contextBridge } = require('electron');
const { getModifiedFileList } = require('./inspect');
const { commitAndSync } = require('./sync');
const { getWorkspacesAsList } = require('../workspaces');
const { getPreference } = require('../preferences');

contextBridge.exposeInMainWorld('git', {
  getModifiedFileList,
  commitAndSync: (wikiPath, githubRepoUrl) => {
    const userInfo = getPreference('github-user-info');
    return commitAndSync(wikiPath, githubRepoUrl, userInfo);
  },
  getWorkspacesAsList,
});
