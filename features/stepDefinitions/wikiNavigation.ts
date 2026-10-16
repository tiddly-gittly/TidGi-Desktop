import { Then } from '@cucumber/cucumber';
import { WindowNames } from '../../src/services/windows/WindowProperties';
import { executeTiddlyWikiCode } from '../supports/webContentsViewHelper';
import type { ApplicationWorld } from './application';

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
