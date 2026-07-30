import type { ISettingFile } from '@/services/database/interface';
import type { INetworkProxyPreferences } from '@/services/preferences/interface';
import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'assert';
import fs from 'fs-extra';
import path from 'path';
import { MockProxyServer } from '../supports/mockProxy';
import { getSettingsPath } from '../supports/paths';
import { executeTiddlyWikiCode } from '../supports/webContentsViewHelper';
import type { ApplicationWorld } from './application';

Given('I start a mock proxy server and configure network proxies', async function(this: ApplicationWorld) {
  const server = new MockProxyServer();
  await server.start();
  this.mockProxyServer = server;

  const networkProxies: INetworkProxyPreferences = {
    default: { url: server.baseUrl },
    wikiBackend: { useDefault: false, url: server.baseUrl },
    wikiFrontend: { useDefault: true, url: '' },
    git: { useDefault: true, url: '' },
  };
  const settingsPath = getSettingsPath(this);
  await fs.ensureDir(path.dirname(settingsPath));
  const existing = await fs.pathExists(settingsPath) ? await fs.readJson(settingsPath) as Partial<ISettingFile> : {};
  await fs.writeJson(settingsPath, {
    ...existing,
    preferences: {
      ...(existing.preferences ?? {}),
      networkProxies,
    },
  }, { spaces: 2 });
});

When('I request through the Wiki web page proxy', async function(this: ApplicationWorld) {
  assert(this.app, 'Application is not launched');
  assert(this.currentWindow, 'Current window is not available');

  const frontendResult = await executeTiddlyWikiCode<string>(
    this.app,
    `fetch('http://wiki-frontend.proxy-test.invalid/probe').then(response => response.text())`,
    this.currentWindow,
  );
  assert(frontendResult?.includes('wiki-frontend.proxy-test.invalid'), `Unexpected frontend proxy response: ${frontendResult}`);
});

When('I request through the Wiki backend proxy', async function(this: ApplicationWorld) {
  assert(this.app, 'Application is not launched');
  assert(this.currentWindow, 'Current window is not available');
  const workspaceID = await executeTiddlyWikiCode<string>(
    this.app,
    `window.meta().workspace.id`,
    this.currentWindow,
  );
  assert(workspaceID, 'Active Wiki workspace ID is unavailable');
  const backendResult = await this.currentWindow.evaluate(
    async ({ id, url }: { id: string; url: string }) => await window.service.wiki.probeNetworkProxyForTest(id, url),
    { id: workspaceID, url: 'http://wiki-backend.proxy-test.invalid/probe' },
  );
  assert(backendResult.includes('wiki-backend.proxy-test.invalid'), `Unexpected backend proxy response: ${backendResult}`);
});

When('I request through the Git process proxy', async function(this: ApplicationWorld) {
  assert(this.currentWindow, 'Current window is not available');
  await this.currentWindow.evaluate(
    async (url: string) => await window.service.git.probeNetworkProxyForTest(url),
    'http://git.proxy-test.invalid/repository.git',
  );
});

Then('the mock proxy server should receive all target traffic', function(this: ApplicationWorld) {
  assert(this.mockProxyServer, 'Mock proxy server is not started');
  const urls = this.mockProxyServer.requests.map(request => request.url);
  for (
    const hostname of [
      'wiki-frontend.proxy-test.invalid',
      'wiki-backend.proxy-test.invalid',
      'git.proxy-test.invalid',
    ]
  ) {
    assert(
      urls.some(url => url.includes(hostname)),
      `Expected proxy request for ${hostname}; received: ${urls.join(', ')}`,
    );
  }
});
