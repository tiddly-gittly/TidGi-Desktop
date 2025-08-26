import { When } from '@cucumber/cucumber';
import fs from 'fs-extra';
import type { IWorkspace } from '../../src/services/workspaces/interface';
import { settingsPath, wikiTestWikiPath } from '../supports/paths';

When('I cleanup test wiki', async function() {
  // DEBUG: console
  console.log(`'I cleanup test wiki'`);
  if (fs.existsSync(wikiTestWikiPath)) fs.removeSync(wikiTestWikiPath);

  type SettingsFile = { workspaces?: Record<string, IWorkspace> } & Record<string, unknown>;
  const settings = fs.readJsonSync(settingsPath) as SettingsFile;
  const workspaces: Record<string, IWorkspace> = settings.workspaces ?? {};
  const filtered: Record<string, IWorkspace> = {};
  for (const id of Object.keys(workspaces)) {
    const ws = workspaces[id];
    const name = ws.name;
    if (name === 'wiki' || id === 'wiki') continue;
    filtered[id] = ws;
  }
  fs.writeJsonSync(settingsPath, { ...settings, workspaces: filtered }, { spaces: 2 });
});
