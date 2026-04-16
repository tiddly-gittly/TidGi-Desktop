import type { IAgentInstanceService } from '@services/agentInstance/interface';
import { container } from '@services/container';
import serviceIdentifier from '@services/serviceIdentifier';
import { describe, expect, it } from 'vitest';

describe('AgentInstanceService worker cleanup', () => {
  it('cleans reverse worker conversation mapping when a single worker conversation is cleaned up', () => {
    const service = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance) as unknown as {
      workerConversationByAgentId: Map<string, string>;
      workerAgentIdByConversationId: Map<string, string>;
      workerConversationCleanupByAgentId: Map<string, () => void>;
      cleanupWorkerConversation: (agentId: string) => void;
    };

    const agentId = 'agent-cleanup-test';
    const conversationId = 'worker-conversation-cleanup-test';
    service.workerConversationByAgentId.set(agentId, conversationId);
    service.workerAgentIdByConversationId.set(conversationId, agentId);
    service.workerConversationCleanupByAgentId.set(agentId, () => undefined);

    service.cleanupWorkerConversation(agentId);

    expect(service.workerConversationCleanupByAgentId.has(agentId)).toBe(false);
    expect(service.workerAgentIdByConversationId.has(conversationId)).toBe(false);

    service.workerConversationByAgentId.delete(agentId);
  });

  it('clears reverse worker conversation mappings when disposing the worker', async () => {
    const service = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance) as unknown as {
      workerConversationByAgentId: Map<string, string>;
      workerAgentIdByConversationId: Map<string, string>;
      workerConversationCleanupByAgentId: Map<string, () => void>;
      memeLoopNativeWorker?: { terminate: () => Promise<void> };
      memeLoopWorker?: unknown;
      disposeMemeLoopWorker: () => Promise<void>;
    };

    const agentId = 'agent-dispose-test';
    const conversationId = 'worker-conversation-dispose-test';
    service.workerConversationByAgentId.set(agentId, conversationId);
    service.workerAgentIdByConversationId.set(conversationId, agentId);
    service.workerConversationCleanupByAgentId.set(agentId, () => undefined);
    service.memeLoopNativeWorker = {
      terminate: async () => undefined,
    };
    service.memeLoopWorker = {};

    await service.disposeMemeLoopWorker();

    expect(service.workerConversationByAgentId.size).toBe(0);
    expect(service.workerAgentIdByConversationId.size).toBe(0);
    expect(service.workerConversationCleanupByAgentId.size).toBe(0);
    expect(service.memeLoopNativeWorker).toBeUndefined();
    expect(service.memeLoopWorker).toBeUndefined();
  });
});
