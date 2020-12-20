/**
 * Provide API from electron to tiddlywiki
 * This file should be required by BrowserView's preload script to work
 */
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'contextBri... Remove this comment to see the full error message
import { contextBridge } from 'electron';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'getModifie... Remove this comment to see the full error message
import { getModifiedFileList } from './inspect';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'commitAndS... Remove this comment to see the full error message
import { commitAndSync } from './sync';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'getWorkspa... Remove this comment to see the full error message
import { getWorkspacesAsList } from '../workspaces';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'getPrefere... Remove this comment to see the full error message
import { getPreference } from '../preferences';

contextBridge.exposeInMainWorld('git', {
  getModifiedFileList,
  commitAndSync: (wikiPath: any, githubRepoUrl: any) => {
    const userInfo = getPreference('github-user-info');
    return commitAndSync(wikiPath, githubRepoUrl, userInfo);
  },
  getWorkspacesAsList,
});
