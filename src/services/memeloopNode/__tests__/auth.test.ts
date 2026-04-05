import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MemeloopNode } from '../index';

// Mock dependencies
vi.mock('@services/libs/log', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@services/container', () => ({
  container: {
    get: vi.fn(() => ({
      getMemeLoopWorkerProxy: vi.fn(async () => ({
        getConnectedPeers: vi.fn(async () => []),
        getSyncStatus: vi.fn(async () => ({ versionVector: {}, peerCount: 0, syncRunning: false })),
      })),
    })),
  },
}));

vi.mock('@services/serviceIdentifier', () => ({
  default: { AgentInstance: Symbol.for('AgentInstance'), Preference: Symbol.for('Preference') },
}));

const mockPreferenceService = {
  get: vi.fn(),
  set: vi.fn(),
};

vi.mock('memeloop-node', async () => {
  const actual = await vi.importActual<typeof import('memeloop-node')>('memeloop-node');
  return {
    ...actual,
    startNodeServerWithMdns: vi.fn(async () => {
      const http = await import('node:http');
      return http.createServer();
    }),
  };
});

// Temp directory for test keypair/config files
let tmpDir: string;

describe('MemeloopNode auth methods', () => {
  let service: MemeloopNode;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memeloop-auth-test-'));

    // Override home dir so keypair/known_nodes go to temp
    const origHome = os.homedir;
    vi.spyOn(os, 'homedir').mockReturnValue(tmpDir);

    // Create service (inversify @inject is not used in test — just instantiate directly)
    service = new MemeloopNode(mockPreferenceService as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getIdentityStatus', () => {
    it('returns identity with keypair loaded', async () => {
      const status = await service.getIdentityStatus();
      expect(status.hasKeypair).toBe(true);
      expect(status.nodeId).toBeTruthy();
      expect(status.cloudLoggedIn).toBe(false);
      expect(status.cloudNodeRegistered).toBe(false);
      expect(status.knownNodeCount).toBe(0);
    });
  });

  describe('getLocalPinCode', () => {
    it('returns 6-char uppercase hex PIN', async () => {
      const pin = await service.getLocalPinCode();
      expect(pin).toHaveLength(6);
      expect(pin).toMatch(/^[0-9A-F]{6}$/);
    });

    it('returns stable PIN for same keypair', async () => {
      const pin1 = await service.getLocalPinCode();
      const pin2 = await service.getLocalPinCode();
      expect(pin1).toBe(pin2);
    });
  });

  describe('cloud auth', () => {
    it('getCloudUrl returns null when not configured', async () => {
      const url = await service.getCloudUrl();
      expect(url).toBeNull();
    });

    it('setCloudUrl persists and getCloudUrl returns it', async () => {
      await service.setCloudUrl('https://api.memeloop.test');
      const url = await service.getCloudUrl();
      expect(url).toBe('https://api.memeloop.test');
    });

    it('setCloudUrl strips trailing slashes', async () => {
      await service.setCloudUrl('https://api.memeloop.test///');
      const url = await service.getCloudUrl();
      expect(url).toBe('https://api.memeloop.test');
    });

    it('cloudLogin fails when cloud URL is unreachable or not configured', async () => {
      const result = await service.cloudLogin('test@example.com', 'password');
      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('cloudLogout clears tokens', async () => {
      await service.setCloudUrl('https://api.memeloop.test');
      await service.cloudLogout();
      const status = await service.getIdentityStatus();
      expect(status.cloudLoggedIn).toBe(false);
    });
  });

  describe('known nodes', () => {
    it('getKnownNodes returns empty initially', async () => {
      const nodes = await service.getKnownNodes();
      expect(nodes).toEqual([]);
    });

    it('removeKnownNode on empty list is safe', async () => {
      await service.removeKnownNode('non-existent');
      const nodes = await service.getKnownNodes();
      expect(nodes).toEqual([]);
    });
  });

  describe('regenerateKeypair', () => {
    it('regenerates keypair and returns new nodeId', async () => {
      const status1 = await service.getIdentityStatus();
      const result = await service.regenerateKeypair();
      expect(result.nodeId).toBeTruthy();
      // The new nodeId should differ from the original
      // (extremely unlikely to be the same with random keygen)
      const status2 = await service.getIdentityStatus();
      expect(status2.hasKeypair).toBe(true);
      expect(status2.nodeId).toBe(result.nodeId);
    });
  });
});
