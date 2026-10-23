import { Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { WindowNames } from '../../src/services/windows/WindowProperties';
import { CUCUMBER_GLOBAL_TIMEOUT } from '../supports/timeouts';
import { executeTiddlyWikiCode } from '../supports/webContentsViewHelper';
import type { ApplicationWorld } from './application';

Then('a pending folder check should name its workspace and clear without an approval action', async function(this: ApplicationWorld) {
  if (!this.mainWindow) throw new Error('Application not launched');
  const page = this.mainWindow;
  // Exercise live service metadata -> renderer subscription in the packaged
  // app. Real OS consent remains platform-specific; this test creates no prompt.
  const workspace = await page.evaluate(async (windowName) => {
    const active = await window.service.workspace.getActiveWorkspace();
    if (!active) throw new Error('No active workspace');
    await window.service.view.hideView(active.id, windowName);
    await window.service.workspace.updateMetaData(active.id, { isLoading: true, isWaitingForFolderAccess: true, didFailLoadErrorMessage: null });
    return { id: active.id, name: active.name ?? active.id };
  }, WindowNames.main);
  const status = page.locator('[data-testid="workspace-folder-access-status"]');
  try {
    await status.waitFor({ timeout: CUCUMBER_GLOBAL_TIMEOUT });
    const text = await status.innerText();
    assert.ok(text.includes(workspace.name), 'The pending workspace must be identified');
    assert.match(text, /If macOS|如果 macOS/, 'Permission guidance must be conditional, not a claim that a dialog exists');
    await page.evaluate(async (id) => {
      await window.service.workspace.updateMetaData(id, { isLoading: false, isWaitingForFolderAccess: false });
    }, workspace.id);
    await status.waitFor({ state: 'hidden', timeout: CUCUMBER_GLOBAL_TIMEOUT });
  } finally {
    await page.evaluate(async ({ id, windowName }) => {
      await window.service.workspace.updateMetaData(id, { isLoading: false, isWaitingForFolderAccess: false });
      await window.service.view.showView(id, windowName);
    }, { id: workspace.id, windowName: WindowNames.main });
  }
});

Then('reloading a different saved wiki fragment should recreate the document and its services', async function(this: ApplicationWorld) {
  if (!this.app || !this.mainWindow) throw new Error('Application not launched');
  // Exercise both restoring a different fragment and reloading that same URL.
  for (const restoreFragment of [true, false]) {
    await executeTiddlyWikiCode(this.app, 'window.__tidgiReloadProbe = true', this.mainWindow);
    await this.mainWindow.evaluate(async ({ windowName, restoreFragment }) => {
      const workspace = await window.service.workspace.getActiveWorkspace();
      if (!workspace) throw new Error('No active workspace');
      const current = await window.service.view.getViewCurrentUrl(workspace.id, windowName);
      if (!current) throw new Error('No current wiki URL');
      const destination = new URL(current);
      if (restoreFragment) destination.hash = '#NavigationReloadProbe';
      await window.service.preference.set('rememberLastPageVisited', true);
      await window.service.workspace.update(workspace.id, { lastUrl: destination.href });
      await window.service.view.reloadViewsWebContents(workspace.id);
    }, { windowName: WindowNames.main, restoreFragment });
    const result = await executeTiddlyWikiCode<{ fresh: boolean; service: boolean; fragment: string; openTitles: string[] }>(
      this.app,
      '({fresh: window.__tidgiReloadProbe === undefined, service: typeof window.service?.workspace?.get === "function", fragment: location.hash, openTitles: $tw.wiki.getTiddlerList("$:/StoryList")})',
      this.mainWindow,
    );
    // TiddlyWiki normalizes the fragment to focused-title:story-list. Reload
    // can clear focus while retaining the requested tiddler in the open story.
    if (!result?.fresh || !result.service || !result.openTitles.includes('NavigationReloadProbe')) {
      throw new Error(`Saved-fragment reload did not recreate a working document: ${JSON.stringify(result)}`);
    }
  }
});
