import { Given } from '@cucumber/cucumber';
import fs from 'fs-extra';
import { omit } from 'lodash';
import path from 'path';
import type { ISettingFile } from '../../src/services/database/interface';
import { settingsPath } from '../supports/paths';

Given('I configure menubar with shortcut', async function() {
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
    attachToMenubar: true,
    keyboardShortcuts: {
      ...(existing.preferences?.keyboardShortcuts || {}),
      'Window.toggleMenubarWindow': shortcut,
    },
  };
  const finalSettings = { ...existing, preferences: updatedPreferences } as ISettingFile;
  await fs.writeJson(settingsPath, finalSettings, { spaces: 2 });
});

// Cleanup function to be called after menubar tests (after app closes)
function clearMenubarSettings() {
  if (!fs.existsSync(settingsPath)) return;
  const parsed = fs.readJsonSync(settingsPath) as ISettingFile;
  // Remove menubar-related preferences to avoid affecting other tests
  const cleanedPreferences = omit(parsed.preferences || {}, [
    'attachToMenubar',
    'menubarSyncWorkspaceWithMainWindow',
    'menubarFixedWorkspaceId',
    'menuBarAlwaysOnTop',
    'sidebarOnMenubar',
    'showMenubarWindowTitleBar',
  ]);
  // Also clean up the menubar shortcut from keyboardShortcuts
  if (cleanedPreferences.keyboardShortcuts) {
    cleanedPreferences.keyboardShortcuts = omit(cleanedPreferences.keyboardShortcuts, ['Window.toggleMenubarWindow']);
  }
  const cleaned = { ...parsed, preferences: cleanedPreferences };
  fs.writeJsonSync(settingsPath, cleaned, { spaces: 2 });
}

export { clearMenubarSettings };
