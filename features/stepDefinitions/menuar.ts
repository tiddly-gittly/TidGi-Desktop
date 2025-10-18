import { Given } from '@cucumber/cucumber';
import fs from 'fs-extra';
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
