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
    attachToTidgiMiniWindow: true,
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
    'attachToTidgiMiniWindow',
    'tidgiMiniWindowSyncWorkspaceWithMainWindow',
    'tidgiMiniWindowFixedWorkspaceId',
    'tidgiMiniWindowAlwaysOnTop',
    'sidebarOnTidgiMiniWindow',
    'showTidgiMiniWindowTitleBar',
  ]);
  // Also clean up the tidgi mini window shortcut from keyboardShortcuts
  if (cleanedPreferences.keyboardShortcuts) {
    cleanedPreferences.keyboardShortcuts = omit(cleanedPreferences.keyboardShortcuts, ['Window.toggleTidgiMiniWindow']);
  }
  const cleaned = { ...parsed, preferences: cleanedPreferences };
  fs.writeJsonSync(settingsPath, cleaned, { spaces: 2 });
}

export { clearTidgiMiniWindowSettings };
