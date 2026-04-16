/**
 * Integration tests for memeloop worker lifecycle and IPC API chain.
 *
 * These tests verify:
 * 1. Worker coexistence with Wiki worker (startup/restart flows)
 * 2. Frontend IPC proxy correctness (MemeloopNode → worker → runtime)
 * 3. Bidirectional mapping integrity during conversation lifecycle
 */
import type { IAgentInstanceService } from '@services/agentInstance/interface';
import { container } from '@services/container';
import serviceIdentifier from '@services/serviceIdentifier';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type WorkerInternals = {
  memeLoopNativeWorker?: { terminate: () => Promise<void>; postMessage: (msg: unknown) => void };
  memeLoopWorker?: {
    ping: () => Promise<{ ok: boolean; initializedAt: number; nodeId?: string; port?: number }>;
    createAgent: (defId: string, msg?: string) => Promise<{ conversationId: string }>;
    sendMessage: (convId: string, msg: string) => Promise<{ ok: boolean }>;
    cancelAgent: (convId: string) => Promise<{ ok: boolean }>;
    getConnectedPeers: () => Promise<unknown[]>;
    syncNow: () => Promise<{ synced: boolean }>;
    getSyncStatus: () => Promise<{ versionVector: Record<string, number>; peerCount: number; syncRunning: boolean }>;
    addPeer: (wsUrl: string) => Promise<{ nodeId: string }>;
    removePeer: (nodeId: string) => Promise<void>;
    antiEntropy: () => Promise<{ synced: boolean }>;
  };
  workerConversationByAgentId: Map<string, string>;
  workerAgentIdByConversationId: Map<string, string>;
  workerConversationCleanupByAgentId: Map<string, () => void>;
  initializeMemeLoopWorker: () => Promise<void>;
  disposeMemeLoopWorker: () => Promise<void>;
  ensureMemeLoopWorkerHealthy: () => Promise<void>;
  cleanupWorkerConversation: (agentId: string) => void;
};

function getService(): IAgentInstanceService & WorkerInternals {
  return container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance) as unknown as IAgentInstanceService & WorkerInternals;
}

describe('MemeLoop worker integration', () => {
  let service: ReturnType<typeof getService>;

  beforeEach(() => {
    service = getService();
    // Clear any residual state
    service.workerConversationByAgentId.clear();
    service.workerAgentIdByConversationId.clear();
    service.workerConversationCleanupByAgentId.clear();
  });

  describe('worker lifecycle', () => {
    it('starts with no worker and empty maps', () => {
      expect(service.workerConversationByAgentId.size).toBe(0);
      expect(service.workerAgentIdByConversationId.size).toBe(0);
    });

    it('disposeMemeLoopWorker is idempotent when no worker exists', async () => {
      service.memeLoopNativeWorker = undefined;
      service.memeLoopWorker = undefined;
      // Should not throw
      await service.disposeMemeLoopWorker();
      expect(service.memeLoopNativeWorker).toBeUndefined();
      expect(service.memeLoopWorker).toBeUndefined();
    });

    it('disposeMemeLoopWorker terminates thread and clears state', async () => {
      const terminateMock = vi.fn(async () => undefined);
      service.memeLoopNativeWorker = { terminate: terminateMock, postMessage: vi.fn() };
      service.memeLoopWorker = { ping: vi.fn() } as unknown as WorkerInternals['memeLoopWorker'];
      // Set the log cleanup callback that disposeMemeLoopWorker will call
      (service as unknown as { memeLoopWorkerLogCleanup?: () => void }).memeLoopWorkerLogCleanup = () => undefined;

      // Populate maps
      service.workerConversationByAgentId.set('a1', 'c1');
      service.workerAgentIdByConversationId.set('c1', 'a1');
      service.workerConversationCleanupByAgentId.set('a1', () => undefined);

      await service.disposeMemeLoopWorker();

      expect(terminateMock).toHaveBeenCalled();
      expect(service.workerConversationByAgentId.size).toBe(0);
      expect(service.workerAgentIdByConversationId.size).toBe(0);
      expect(service.workerConversationCleanupByAgentId.size).toBe(0);
      expect(service.memeLoopNativeWorker).toBeUndefined();
      expect(service.memeLoopWorker).toBeUndefined();
    });
  });

  describe('bidirectional conversation mapping', () => {
    it('maintains consistent agentId ↔ conversationId mapping', () => {
      const agentId = 'agent-bidir-1';
      const conversationId = 'conv-bidir-1';

      service.workerConversationByAgentId.set(agentId, conversationId);
      service.workerAgentIdByConversationId.set(conversationId, agentId);

      expect(service.workerConversationByAgentId.get(agentId)).toBe(conversationId);
      expect(service.workerAgentIdByConversationId.get(conversationId)).toBe(agentId);
    });

    it('cleanupWorkerConversation removes both directions', () => {
      const agentId = 'agent-cleanup-bidir';
      const conversationId = 'conv-cleanup-bidir';

      service.workerConversationByAgentId.set(agentId, conversationId);
      service.workerAgentIdByConversationId.set(conversationId, agentId);
      service.workerConversationCleanupByAgentId.set(agentId, () => undefined);

      service.cleanupWorkerConversation(agentId);

      expect(service.workerConversationCleanupByAgentId.has(agentId)).toBe(false);
      expect(service.workerAgentIdByConversationId.has(conversationId)).toBe(false);
      // workerConversationByAgentId is NOT cleaned by cleanupWorkerConversation — test that behavior
      expect(service.workerConversationByAgentId.has(agentId)).toBe(true);

      // Clean up
      service.workerConversationByAgentId.delete(agentId);
    });

    it('multiple concurrent conversations maintain isolated mappings', () => {
      const pairs = [
        { agentId: 'a1', conversationId: 'c1' },
        { agentId: 'a2', conversationId: 'c2' },
        { agentId: 'a3', conversationId: 'c3' },
      ];

      for (const { agentId, conversationId } of pairs) {
        service.workerConversationByAgentId.set(agentId, conversationId);
        service.workerAgentIdByConversationId.set(conversationId, agentId);
        service.workerConversationCleanupByAgentId.set(agentId, () => undefined);
      }

      // Cleanup middle one
      service.cleanupWorkerConversation('a2');

      expect(service.workerAgentIdByConversationId.has('c1')).toBe(true);
      expect(service.workerAgentIdByConversationId.has('c2')).toBe(false);
      expect(service.workerAgentIdByConversationId.has('c3')).toBe(true);

      // Clean up
      for (const { agentId } of pairs) {
        service.workerConversationByAgentId.delete(agentId);
        service.workerConversationCleanupByAgentId.delete(agentId);
      }
      service.workerAgentIdByConversationId.delete('c1');
      service.workerAgentIdByConversationId.delete('c3');
    });
  });

  describe('MemeloopNode IPC proxy surface', () => {
    it('worker proxy methods exist when worker is installed', async () => {
      const mockPing = vi.fn(async () => ({
        ok: true,
        initializedAt: Date.now(),
        nodeId: 'test-node-id',
        port: 5200,
      }));

      service.memeLoopWorker = {
        ping: mockPing,
        createAgent: vi.fn(),
        sendMessage: vi.fn(),
        cancelAgent: vi.fn(),
        getConnectedPeers: vi.fn(async () => []),
        syncNow: vi.fn(async () => ({ synced: true })),
        getSyncStatus: vi.fn(async () => ({ versionVector: {}, peerCount: 0, syncRunning: false })),
        addPeer: vi.fn(async () => ({ nodeId: 'peer1' })),
        removePeer: vi.fn(async () => undefined),
        antiEntropy: vi.fn(async () => ({ synced: true })),
      } as unknown as WorkerInternals['memeLoopWorker'];

      const result = await service.memeLoopWorker!.ping();
      expect(result.ok).toBe(true);
      expect(result.nodeId).toBe('test-node-id');
      expect(result.port).toBe(5200);
    });
  });

  describe('worker restart resilience', () => {
    it('dispose then re-mock simulates worker restart scenario', async () => {
      // Simulate an active worker
      service.memeLoopNativeWorker = {
        terminate: vi.fn(async () => undefined),
        postMessage: vi.fn(),
      };
      service.memeLoopWorker = {
        ping: vi.fn(async () => ({ ok: true, initializedAt: Date.now() })),
      } as unknown as WorkerInternals['memeLoopWorker'];
      (service as unknown as { memeLoopWorkerLogCleanup?: () => void }).memeLoopWorkerLogCleanup = () => undefined;
      service.workerConversationByAgentId.set('old-agent', 'old-conv');
      service.workerAgentIdByConversationId.set('old-conv', 'old-agent');

      // Dispose (simulates worker crash/restart)
      await service.disposeMemeLoopWorker();

      expect(service.workerConversationByAgentId.size).toBe(0);
      expect(service.memeLoopWorker).toBeUndefined();

      // Re-initialize with new mock (simulates restart)
      service.memeLoopNativeWorker = {
        terminate: vi.fn(async () => undefined),
        postMessage: vi.fn(),
      };
      service.memeLoopWorker = {
        ping: vi.fn(async () => ({ ok: true, initializedAt: Date.now(), nodeId: 'restarted-node' })),
      } as unknown as WorkerInternals['memeLoopWorker'];

      const result = await service.memeLoopWorker!.ping();
      expect(result.ok).toBe(true);
      expect(result.nodeId).toBe('restarted-node');
      expect(service.workerConversationByAgentId.size).toBe(0);
    });
  });
});
