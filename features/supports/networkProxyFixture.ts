import type { ISettingFile } from '@/services/database/interface';
import type { INetworkProxyPreferences } from '@/services/preferences/interface';
import assert from 'assert';
import fs from 'fs-extra';
import path from 'path';
import type { ApplicationWorld } from '../stepDefinitions/application';
import { MockProxyServer } from './mockProxy';
import { getSettingsPath } from './paths';

export async function setupNetworkProxyFixture(world: ApplicationWorld): Promise<void> {
  const server = new MockProxyServer();
  await server.start();
  world.mockProxyServer = server;

  const networkProxies: INetworkProxyPreferences = {
    default: { url: server.baseUrl },
    wikiBackend: { useDefault: false, url: server.baseUrl },
    wikiFrontend: { useDefault: true, url: '' },
    git: { useDefault: true, url: '' },
  };
  const settingsPath = getSettingsPath(world);
  await fs.ensureDir(path.dirname(settingsPath));
  const existing = await fs.pathExists(settingsPath) ? await fs.readJson(settingsPath) as Partial<ISettingFile> : {};
  await fs.writeJson(settingsPath, {
    ...existing,
    preferences: {
      ...(existing.preferences ?? {}),
      networkProxies,
    },
  }, { spaces: 2 });
}

export function verifyNetworkProxyFixtureRequests(world: ApplicationWorld): void {
  assert(world.mockProxyServer, 'Mock proxy server is not started');
  const receivedUrls = world.mockProxyServer.requests.map(request => request.url);
  for (
    const hostname of [
      'wiki-frontend.proxy-test.invalid',
      'wiki-backend.proxy-test.invalid',
      'git.proxy-test.invalid',
    ]
  ) {
    assert(
      receivedUrls.some(url => url.includes(hostname)),
      `Expected the mock proxy to receive ${hostname}; received: ${receivedUrls.join(', ')}`,
    );
  }
}
