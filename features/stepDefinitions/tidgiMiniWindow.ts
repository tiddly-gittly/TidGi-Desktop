import { Given } from '@cucumber/cucumber';
import fs from 'fs-extra';
import { omit } from 'lodash';
import path from 'path';
import type { ISettingFile } from '../../src/services/database/interface';
import { settingsPath } from '../supports/paths';

Given('I configure tidgi mini window with shortcut', async function() {
  let existing = {} as ISettingFile;
  if (await fs.pathExists(settingsPath)) {
    existing = await fs.readJson(settingsPath) as ISettingFile;
  } else {
    // ensure settings directory exists so writeJsonSync won't fail
    await fs.ensureDir(path.dirname(settingsPath));
  }

  // Convert CommandOrControl to platform-specific format
  const isWindows = process.platform === 'win32';
  const isLinux = process.platform === 'linux';
  let shortcut = 'CommandOrControl+Shift+M';
  if (isWindows || isLinux) {
    shortcut = 'Ctrl+Shift+M';
  } else {
    shortcut = 'Cmd+Shift+M';
  }

  const updatedPreferences = {
    ...existing.preferences,
    tidgiMiniWindow: true,
    keyboardShortcuts: {
      ...(existing.preferences?.keyboardShortcuts || {}),
      'Window.toggleTidgiMiniWindow': shortcut,
    },
  };
  const finalSettings = { ...existing, preferences: updatedPreferences } as ISettingFile;
  await fs.writeJson(settingsPath, finalSettings, { spaces: 2 });
});

// Cleanup function to be called after tidgi mini window tests (after app closes)
function clearTidgiMiniWindowSettings() {
  if (!fs.existsSync(settingsPath)) return;
  const parsed = fs.readJsonSync(settingsPath) as ISettingFile;
  // Remove tidgi mini window-related preferences to avoid affecting other tests
  const cleanedPreferences = omit(parsed.preferences || {}, [
    'tidgiMiniWindow',
    'tidgiMiniWindowSyncWorkspaceWithMainWindow',
    'tidgiMiniWindowFixedWorkspaceId',
    'tidgiMiniWindowAlwaysOnTop',
    'tidgiMiniWindowShowSidebar',
    'tidgiMiniWindowShowTitleBar',
  ]);
  // Also clean up the tidgi mini window shortcut from keyboardShortcuts
  if (cleanedPreferences.keyboardShortcuts) {
    cleanedPreferences.keyboardShortcuts = omit(cleanedPreferences.keyboardShortcuts, ['Window.toggleTidgiMiniWindow']);
  }
  
  // Reset active workspace to first wiki workspace to avoid agent workspace being active
  const workspaces = parsed.workspaces || {};
  const workspaceEntries = Object.entries(workspaces);
  // Set all workspaces to inactive first
  for (const [, workspace] of workspaceEntries) {
    workspace.active = false;
  }
  // Find first non-page-type workspace (wiki) and activate it
  const firstWikiWorkspace = workspaceEntries.find(([, workspace]) => !workspace.pageType);
  if (firstWikiWorkspace) {
    firstWikiWorkspace[1].active = true;
  }
  
  const cleaned = { ...parsed, preferences: cleanedPreferences, workspaces };
  fs.writeJsonSync(settingsPath, cleaned, { spaces: 2 });
}

export { clearTidgiMiniWindowSettings };
