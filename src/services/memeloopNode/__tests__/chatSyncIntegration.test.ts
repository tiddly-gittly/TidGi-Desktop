import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ChatSyncEngine, PeerNodeSyncAdapter, type PeerNodeTransport, type ChatSyncPeer } from 'memeloop';
import type { IAgentStorage } from 'memeloop';
import type { ConversationMeta, ChatMessage } from '@memeloop/protocol';

/**
 * Test the ChatSyncEngine + PeerNodeSyncAdapter integration pattern
 * used in memeloopWorker.ts for Desktop's selective sync.
 */

function createMockStorage(): IAgentStorage {
  const conversations = new Map<string, ConversationMeta>();
  const messages = new Map<string, ChatMessage[]>();

  return {
    listConversations: vi.fn(async () => Array.from(conversations.values())),
    getMessages: vi.fn(async (cid: string) => messages.get(cid) ?? []),
    appendMessage: vi.fn(async (msg: ChatMessage) => {
      const list = messages.get(msg.conversationId) ?? [];
      list.push(msg);
      messages.set(msg.conversationId, list);
    }),
    upsertConversationMetadata: vi.fn(async (meta: ConversationMeta) => {
      conversations.set(meta.conversationId, meta);
    }),
    insertMessagesIfAbsent: vi.fn(async (incoming: ChatMessage[]) => {
      for (const msg of incoming) {
        const list = messages.get(msg.conversationId) ?? [];
        if (!list.some((m) => m.messageId === msg.messageId)) {
          list.push(msg);
          messages.set(msg.conversationId, list);
        }
      }
    }),
    getAttachment: vi.fn(async () => null),
    saveAttachment: vi.fn(async () => undefined),
    getAgentDefinition: vi.fn(async () => null),
    saveAgentInstance: vi.fn(async () => undefined),
    getConversationMeta: vi.fn(async (cid: string) => conversations.get(cid) ?? null),
  };
}

describe('ChatSyncEngine Desktop integration', () => {
  let storage: IAgentStorage;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it('creates engine with empty peers and syncOnce is a no-op', async () => {
    const engine = new ChatSyncEngine({
      nodeId: 'desktop-test-1',
      storage,
      peers: () => [],
    });

    await engine.syncOnce();
    expect(engine.getVersionVector()).toHaveProperty('desktop-test-1', 0);
  });

  it('bumpLocalVersion increments the node clock', () => {
    const engine = new ChatSyncEngine({
      nodeId: 'desktop-test-2',
      storage,
      peers: () => [],
    });

    engine.bumpLocalVersion();
    engine.bumpLocalVersion();
    expect(engine.getVersionVector()['desktop-test-2']).toBe(2);
  });

  it('PeerNodeSyncAdapter delegates to transport', async () => {
    const transport: PeerNodeTransport = {
      nodeId: 'local-node',
      exchangeVersionVector: vi.fn(async () => ({
        remoteVersion: { 'remote-node': 5 },
        missingForRemote: [],
      })),
      pullMissingMetadata: vi.fn(async () => []),
      pullMissingMessages: vi.fn(async () => []),
      pullAttachmentBlob: vi.fn(async () => null),
    };

    const adapter = new PeerNodeSyncAdapter('remote-node', transport);
    expect(adapter.nodeId).toBe('remote-node');

    const result = await adapter.exchangeVersionVector({ 'local-node': 0 });
    expect(transport.exchangeVersionVector).toHaveBeenCalledWith('remote-node', { 'local-node': 0 });
    expect(result.remoteVersion).toEqual({ 'remote-node': 5 });
  });

  it('syncOnce pulls metadata from peers and merges version vectors', async () => {
    const remoteMeta: ConversationMeta = {
      conversationId: 'conv-1',
      title: 'Test Conversation',
      lastMessagePreview: 'hello',
      lastMessageTimestamp: 1000,
      messageCount: 1,
      originNodeId: 'remote-node',
      definitionId: 'task-agent',
      isUserInitiated: true,
    };

    const transport: PeerNodeTransport = {
      nodeId: 'local-node',
      exchangeVersionVector: vi.fn(async () => ({
        remoteVersion: { 'remote-node': 1 },
        missingForRemote: [],
      })),
      pullMissingMetadata: vi.fn(async () => [remoteMeta]),
      pullMissingMessages: vi.fn(async () => []),
      pullAttachmentBlob: vi.fn(async () => null),
    };

    const engine = new ChatSyncEngine({
      nodeId: 'desktop-test-3',
      storage,
      peers: () => [new PeerNodeSyncAdapter('remote-node', transport)],
    });

    await engine.syncOnce();

    // Verify metadata was upserted
    expect(storage.upsertConversationMetadata).toHaveBeenCalledWith(remoteMeta);
    // Version vector should include remote clock
    expect(engine.getVersionVector()['remote-node']).toBe(1);
    // pullMissingMessages should have been called for the new conversation
    expect(transport.pullMissingMessages).toHaveBeenCalledWith('remote-node', 'conv-1', []);
  });
});
