// @vitest-environment node
import { createDeviceIdentity } from '@memeloop/libp2p';
import { Libp2pDeviceNetworkService as BrowserNetwork } from '@memeloop/libp2p/browser';
import type { IAuthenticationService } from '@services/auth/interface';
import type { IDatabaseService } from '@services/database/interface';
import { AGENT_DEVICE_RPC_METHODS, type TrustedDeviceRecord } from 'memeloop/device-network';
import { createServer } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeviceNetworkService } from '../index';
import type { DeviceNetworkPersistedSettings } from '../interface';
import { boundListenPorts, listenAddresses, readListenPorts } from '../listenPorts';

const storage = vi.hoisted((): {
  settings: Map<string, unknown>;
  auth: Map<string, string>;
  failPortWrites: number;
  persistedPorts: unknown;
} => ({
  settings: new Map<string, unknown>(),
  auth: new Map<string, string>(),
  failPortWrites: 0,
  persistedPorts: undefined,
}));
vi.mock('electron', () => ({ app: { getName: () => 'Isolated network test' } }));
vi.mock('@services/libs/authFileStore', () => ({
  getLocalAuthStore: () => ({
    get: (key: string) => storage.auth.get(key),
    set: (key: string, value: string) => storage.auth.set(key, value),
    delete: (key: string) => storage.auth.delete(key),
  }),
}));

const hosts: DeviceNetworkService[] = [];
const clients: BrowserNetwork[] = [];
function host() {
  const database = {
    getSetting: (key: string) => storage.settings.get(key),
    setSetting: (key: string, value: unknown) => storage.settings.set(key, value),
    immediatelyStoreSettingsToFile: async () => {
      if (storage.failPortWrites > 0) {
        storage.failPortWrites--;
        throw new Error('settings flush failed');
      }
      storage.persistedPorts = storedPorts();
    },
  } as unknown as IDatabaseService;
  const service = new DeviceNetworkService({} as IAuthenticationService, database);
  service.configureRuntime({ rpcHandler: async request => ({ echo: request.parameters }) });
  hosts.push(service);
  return service;
}
function storedPorts() {
  return (storage.settings.get('deviceNetwork') as DeviceNetworkPersistedSettings | undefined)?.listenPortsV1;
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map(client => client.stop()));
  await Promise.all(hosts.splice(0).map(service => service.stop()));
  storage.settings.clear();
  storage.auth.clear();
  storage.failPortWrites = 0;
  storage.persistedPorts = undefined;
});

describe('persistent local device-network endpoints', () => {
  it('does not report startup success until ports are durable, even after repeated flush failures leave them in memory', async () => {
    storage.failPortWrites = 2;
    const service = host();
    await expect(service.start()).rejects.toThrow('settings flush failed');
    const ports = storedPorts();
    expect(ports).toBeDefined();
    expect(storage.persistedPorts).toBeUndefined();
    await expect(service.start()).rejects.toThrow('settings flush failed');
    expect(storage.persistedPorts).toBeUndefined();
    await service.start();
    expect(storage.persistedPorts).toEqual(ports);
    expect(boundListenPorts((await service.getLocalDevice()).multiaddrs!)).toEqual(ports);
  });
  it('reconnects a real browser WebSocket RPC after both peers restart with the original identity, trust, and invitation address', async () => {
    const first = host();
    await first.start();
    const identity = await first.getLocalIdentity();
    const ports = boundListenPorts((await first.getLocalDevice()).multiaddrs!);
    expect(storedPorts()).toEqual(ports);
    const address = `/ip4/127.0.0.1/tcp/${ports.webSocketPort}/ws/p2p/${identity.peerId}`;
    const browserIdentity = await createDeviceIdentity('mobile', 'restart browser');
    const records = new Map<string, TrustedDeviceRecord>();
    const createBrowser = () => {
      const client = new BrowserNetwork({
        identity: browserIdentity,
        bootstrapMultiaddrs: [address],
        enableCircuitRelay: false,
        trustStore: {
          loadTrustedDevices: async () => [...records.values()],
          saveTrustedDevice: async record => {
            records.set(record.peerId, record);
          },
          removeTrustedDevice: async peerId => {
            records.delete(peerId);
          },
        },
      });
      clients.push(client);
      return client;
    };
    const client = createBrowser();
    await client.start();
    const outbound = await client.requestLocalPairing(identity.peerId, { multiaddrs: [address] });
    const inbound = (await first.listPairingSessions()).find(session => session.remotePeerId === browserIdentity.peerId)!;
    expect(inbound.confirmCode).toBe(outbound.confirmCode);
    await first.acceptPairing(inbound.sessionId);
    await client.acceptPairing(outbound.sessionId);
    expect(await client.sendRpc(identity.peerId, AGENT_DEVICE_RPC_METHODS.getMainConversation, {})).toEqual({ echo: {} });
    await client.stop();
    await first.stop();

    const restarted = host();
    await restarted.start();
    expect((await restarted.getLocalIdentity()).peerId).toBe(identity.peerId);
    expect(boundListenPorts((await restarted.getLocalDevice()).multiaddrs!)).toEqual(ports);
    expect((await restarted.listDevices()).find(device => device.peerId === browserIdentity.peerId)?.trusted).toBe(true);
    const restoredBrowser = createBrowser();
    await restoredBrowser.start();
    expect(await restoredBrowser.sendRpc(identity.peerId, AGENT_DEVICE_RPC_METHODS.getMainConversation, {}, { signal: AbortSignal.timeout(5_000) })).toEqual({ echo: {} });
  }, 30_000);

  it('reports a saved-port collision without replacing the endpoint and can retry after the port is released', async () => {
    const first = host();
    await first.start();
    const ports = boundListenPorts((await first.getLocalDevice()).multiaddrs!);
    await first.stop();
    const blocker = createServer();
    await new Promise<void>((resolve, reject) => {
      blocker.once('error', reject);
      blocker.listen(ports.webSocketPort, '0.0.0.0', resolve);
    });
    const restarted = host();
    try {
      await expect(restarted.start()).rejects.toThrow(`saved ports (TCP ${ports.tcpPort}, WebSocket ${ports.webSocketPort})`);
      expect(storedPorts()).toEqual(ports);
    } finally {
      await new Promise<void>((resolve, reject) =>
        blocker.close(error => {
          if (error) reject(error);
          else resolve();
        })
      );
    }
    await restarted.start();
    expect(boundListenPorts((await restarted.getLocalDevice()).multiaddrs!)).toEqual(ports);
  }, 30_000);

  it('uses ephemeral ports only for a new profile and rejects invalid saved ports', () => {
    expect(listenAddresses()).toEqual(['/ip4/0.0.0.0/tcp/0', '/ip4/0.0.0.0/tcp/0/ws']);
    expect(readListenPorts(undefined)).toBeUndefined();
    expect(() => readListenPorts({ tcpPort: 0, webSocketPort: 1234 })).toThrow('Invalid saved');
    expect(() => readListenPorts({ tcpPort: 1234, webSocketPort: 1234 })).toThrow('Invalid saved');
  });
});
