import { type AgentInstanceModel, canonicalJsonBytes, type ChatMessage, createAtomicAgentRetryReplacementPayload, createChatMessage } from 'memeloop';
import { describe, expect, it, vi } from 'vitest';

import { AgentDefinitionService } from '@services/agentDefinition';
import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import { AgentInstanceService } from '../../index';
import type { IAgentInstanceService } from '../../interface';
import { MemeLoopDesktopStorage } from '../storage';

type DefinitionServiceOverrides = Pick<IAgentDefinitionService, 'getAgentDef'>;
type InstanceServiceOverrides = Pick<
  IAgentInstanceService,
  | 'getAgentMessage'
  | 'getAgentAttachmentReference'
  | 'readAgentAttachmentRange'
  | 'getAgentConversationMeta'
  | 'getAgentStorageFullContentMessagePage'
>;

function createDefinitionService(overrides: Partial<DefinitionServiceOverrides>): IAgentDefinitionService {
  const service = new AgentDefinitionService();
  Object.assign(service, overrides);
  return service;
}

function createInstanceService(overrides: Partial<InstanceServiceOverrides>): IAgentInstanceService {
  const service = new AgentInstanceService();
  Object.assign(service, overrides);
  return service;
}

function agent(): AgentInstanceModel {
  return {
    id: 'conversation-1',
    agentDefId: 'definition-1',
    name: 'Conversation',
    messages: [],
    status: { state: 'working', modified: new Date(0) },
    created: new Date(0),
    description: '',
    systemPrompt: '',
    tools: [],
    version: '1',
  };
}

describe('Desktop message origin identity', () => {
  it('projects a TypeORM point read to a canonical plain retry source', async () => {
    class TypeOrmMessageEntity implements ChatMessage {
      public readonly agentInstance = { id: 'must-not-cross-storage-boundary' };

      public readonly messageId = 'turn-source';
      public readonly turnId = 'turn-source';
      public readonly conversationId = 'conversation-1';
      public readonly originNodeId = 'desktop';
      public readonly originSequence = 1;
      public readonly timestamp = 1;
      public readonly lamportClock = 1;
      public readonly role = 'user' as const;
      public readonly content = 'retry me';
      public readonly parts = [];
      public readonly metadata = { source: 'typeorm' };
    }
    const storage = new MemeLoopDesktopStorage({
      agentDefinitionService: createDefinitionService({ getAgentDef: vi.fn() }),
      agentInstanceService: createInstanceService({
        getAgentMessage: vi.fn(async () => new TypeOrmMessageEntity()),
      }),
      getLocalNodeId: vi.fn(async () => 'desktop'),
    });

    const source = await storage.getMessageById('conversation-1', 'turn-source');
    expect(source).not.toBeNull();
    expect(Object.getPrototypeOf(source)).toBe(Object.prototype);
    expect(source).not.toHaveProperty('agentInstance');
    expect(source?.parts).toEqual([]);
    expect(() => canonicalJsonBytes(source)).not.toThrow();
    const replacement = createAtomicAgentRetryReplacementPayload(source!, 'turn-replacement');
    expect(Object.getPrototypeOf(replacement)).toBe(Object.prototype);
    expect(() => canonicalJsonBytes(replacement)).not.toThrow();
  });

  it('uses the local libp2p PeerId for newly created user messages', async () => {
    const message = createChatMessage({
      messageId: 'user-message-1',
      turnId: 'user-message-1',
      conversationId: 'conversation-1',
      role: 'user',
      content: 'hello',
      originNodeId: '12D3KooWDesktopPeer',
      originSequence: 1,
      timestamp: 1,
      lamportClock: 1,
    });

    expect(message.originNodeId).toBe('12D3KooWDesktopPeer');
    expect(message.conversationId).toBe('conversation-1');
    expect(message.content).toBe('hello');
  });

  it('assembles model attachment bytes from bounded host range reads', async () => {
    const bytes = new Uint8Array(300_000).map((_, index) => index % 251);
    const readAgentAttachmentRange = vi.fn(async (_contentHash: string, offset: number, maxBytes: number) => bytes.slice(offset, Math.min(bytes.byteLength, offset + maxBytes)));
    const storage = new MemeLoopDesktopStorage({
      agentDefinitionService: createDefinitionService({ getAgentDef: vi.fn() }),
      agentInstanceService: createInstanceService({
        getAgentAttachmentReference: vi.fn(async () => ({
          contentHash: `sha256:${'a'.repeat(64)}`,
          filename: 'image.png',
          mimeType: 'image/png',
          size: bytes.byteLength,
        })),
        readAgentAttachmentRange,
      }),
      getLocalNodeId: vi.fn(async () => 'desktop'),
    });

    await expect(storage.readAttachmentData(`sha256:${'a'.repeat(64)}`)).resolves.toEqual(bytes);
    expect(readAgentAttachmentRange).toHaveBeenCalledTimes(2);
    expect(readAgentAttachmentRange).toHaveBeenNthCalledWith(1, expect.any(String), 0, 256 * 1_024, undefined);
    expect(readAgentAttachmentRange).toHaveBeenNthCalledWith(2, expect.any(String), 256 * 1_024, bytes.byteLength - 256 * 1_024, undefined);
  });

  it('aborts attachment assembly between bounded range reads', async () => {
    const controller = new AbortController();
    const reference = {
      contentHash: `sha256:${'b'.repeat(64)}`,
      filename: 'image.png',
      mimeType: 'image/png',
      size: 300_000,
    };
    const readAgentAttachmentRange = vi.fn(async () => {
      controller.abort(new Error('cancel model image'));
      return new Uint8Array(256 * 1_024);
    });
    const storage = new MemeLoopDesktopStorage({
      agentDefinitionService: createDefinitionService({ getAgentDef: vi.fn() }),
      agentInstanceService: createInstanceService({
        getAgentAttachmentReference: vi.fn(async () => reference),
        readAgentAttachmentRange,
      }),
      getLocalNodeId: vi.fn(async () => 'desktop'),
    });

    await expect(storage.readAttachmentData(reference.contentHash, { signal: controller.signal })).rejects.toThrow(
      'cancel model image',
    );
    expect(readAgentAttachmentRange).toHaveBeenCalledOnce();
  });

  it('uses the local libp2p PeerId for conversation metadata', async () => {
    const currentAgent = agent();
    const canonicalMeta = {
      conversationId: currentAgent.id,
      title: currentAgent.name!,
      lastMessagePreview: 'remote',
      lastMessageTimestamp: 3,
      messageCount: 2,
      originNodeId: '12D3KooWDesktopPeer',
      originClock: 3,
      definitionId: currentAgent.agentDefId,
      isUserInitiated: true,
    };
    const getLocalNodeId = vi.fn(async () => '12D3KooWDesktopPeer');
    const getAgentConversationMeta = vi.fn(async () => canonicalMeta);
    const storage = new MemeLoopDesktopStorage({
      agentDefinitionService: createDefinitionService({
        getAgentDef: vi.fn(async () => undefined),
      }),
      agentInstanceService: createInstanceService({
        getAgentConversationMeta,
      }),
      getLocalNodeId,
    });

    await expect(storage.getConversationMeta(currentAgent.id)).resolves.toMatchObject({
      originNodeId: '12D3KooWDesktopPeer',
      originClock: 3,
    });
    expect(getAgentConversationMeta).toHaveBeenCalledWith('12D3KooWDesktopPeer', currentAgent.id);
    expect(getLocalNodeId).toHaveBeenCalledOnce();
  });

  it('uses the bounded message-page contract instead of loading a complete agent snapshot', async () => {
    const summary: ChatMessage = {
      messageId: 'summary-2',
      turnId: 'summary-2',
      timestamp: 1_000,
      lamportClock: 1_000,
      conversationId: 'conversation-1',
      originNodeId: 'desktop',
      originSequence: 501,
      role: 'assistant',
      content: 'durable summary',
      parts: [{ type: 'text', text: 'durable summary' }],
      metadata: {
        contextCompaction: {
          version: 2,
          coveredVersion: { desktop: 500 },
          coveredMessageCountByOrigin: { desktop: 500 },
          coveredUserTurnCountByOrigin: { desktop: 250 },
          droppedMessageCount: 500,
          droppedTurnCount: 250,
        },
      },
    };
    const tail: ChatMessage = {
      messageId: 'tail-user',
      turnId: 'tail-user',
      conversationId: 'conversation-1',
      originNodeId: 'desktop',
      originSequence: 502,
      timestamp: 501,
      lamportClock: 501,
      role: 'user',
      content: 'continue here',
      parts: [{ type: 'text', text: 'continue here' }],
    };
    const getAgentStorageFullContentMessagePage = vi.fn(async () => ({
      reset: false as const,
      conversationId: 'conversation-1',
      revision: '2',
      items: [summary, tail],
      hasMoreBefore: true,
      hasMoreAfter: false,
    }));
    const storage = new MemeLoopDesktopStorage({
      agentDefinitionService: createDefinitionService({ getAgentDef: vi.fn() }),
      agentInstanceService: createInstanceService({
        getAgentStorageFullContentMessagePage,
      }),
      getLocalNodeId: vi.fn(async () => 'desktop'),
    });

    const options = {
      limit: 50,
      maxBytes: 256 * 1024,
      direction: 'forward',
    } as const;
    await expect(storage.getFullContentMessagePage('conversation-1', options)).resolves.toEqual({
      reset: false,
      conversationId: 'conversation-1',
      revision: '2',
      items: [summary, tail],
      hasMoreBefore: true,
      hasMoreAfter: false,
    });
    expect(getAgentStorageFullContentMessagePage).toHaveBeenCalledOnce();
    expect(getAgentStorageFullContentMessagePage).toHaveBeenCalledWith('conversation-1', options);
  });
});
