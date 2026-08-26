import type { AgentInstance, ChatMessage } from 'memeloop';
import { describe, expect, it, vi } from 'vitest';

import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import type { IAgentInstanceService } from '../../interface';
import { toConversationMeta } from '../messageMapping';
import { MemeLoopDesktopStorage } from '../storage';
import { createMemeLoopUserMessage } from '../userMessage';

function agent(): AgentInstance {
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
  it('uses the local libp2p PeerId for newly created user messages', async () => {
    const message = await createMemeLoopUserMessage({
      agentId: 'conversation-1',
      content: { text: 'hello' },
      originNodeId: '12D3KooWDesktopPeer',
    });

    expect(message.originNodeId).toBe('12D3KooWDesktopPeer');
    expect(Reflect.ownKeys(message)).not.toContain('metadata');
    expect(JSON.parse(JSON.stringify(message))).toStrictEqual(message);
  });

  it('uses the local libp2p PeerId for conversation metadata', async () => {
    const currentAgent = {
      ...agent(),
      messages: [
        {
          messageId: 'local-message',
          turnId: 'local-message',
          conversationId: 'conversation-1',
          originNodeId: '12D3KooWDesktopPeer',
          originSequence: 1,
          timestamp: 2,
          lamportClock: 3,
          role: 'user' as const,
          content: 'local',
        },
        {
          messageId: 'remote-message',
          turnId: 'local-message',
          conversationId: 'conversation-1',
          originNodeId: '12D3KooWRemotePeer',
          originSequence: 1,
          timestamp: 3,
          lamportClock: 99,
          role: 'assistant' as const,
          content: 'remote',
        },
      ],
    };
    const getLocalNodeId = vi.fn(async () => '12D3KooWDesktopPeer');
    const storage = new MemeLoopDesktopStorage({
      agentDefinitionService: {
        getAgentDef: vi.fn(async () => undefined),
      } as unknown as IAgentDefinitionService,
      agentInstanceService: {
        getAgent: vi.fn(async () => currentAgent),
        getAgentMetadata: vi.fn(async () => ({ ...currentAgent, messages: [] })),
        getAgentMessagePage: vi.fn(async () => ({
          items: [currentAgent.messages.at(-1)!],
          hasMoreBefore: true,
          hasMoreAfter: false,
        })),
        getAgentConversationTimelinePage: vi.fn(async () => ({
          items: [],
          totalMessages: currentAgent.messages.length,
          totalTurns: 1,
        })),
        getMaxAgentLamportClock: vi.fn(async () => 3),
      } as unknown as IAgentInstanceService,
      getLocalNodeId,
      notifyAgentChanged: vi.fn(),
    });

    await expect(storage.getConversationMeta(currentAgent.id)).resolves.toMatchObject({
      originNodeId: '12D3KooWDesktopPeer',
      originClock: 3,
    });
    expect(toConversationMeta(currentAgent, '12D3KooWDesktopPeer')).toMatchObject({
      originNodeId: '12D3KooWDesktopPeer',
      originClock: 3,
    });
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
    };
    const getAgent = vi.fn(async () => agent());
    const getAgentMessagePage = vi.fn(async () => ({
      reset: false as const,
      conversationId: 'conversation-1',
      revision: '2',
      items: [summary, tail],
      hasMoreBefore: true,
      hasMoreAfter: false,
    }));
    const storage = new MemeLoopDesktopStorage({
      agentDefinitionService: { getAgentDef: vi.fn() } as unknown as IAgentDefinitionService,
      agentInstanceService: {
        getAgent,
        getAgentMessagePage,
      } as unknown as IAgentInstanceService,
      getLocalNodeId: vi.fn(async () => 'desktop'),
      notifyAgentChanged: vi.fn(),
    });

    await expect(storage.getMessages('conversation-1')).resolves.toEqual([summary, tail]);
    await expect(storage.getMessages('conversation-1', { mode: 'full-content' })).resolves.toEqual([summary, tail]);
    expect(getAgent).not.toHaveBeenCalled();
    expect(getAgentMessagePage).toHaveBeenNthCalledWith(1, 'conversation-1', { limit: 80, maxBytes: 512 * 1024 });
    expect(getAgentMessagePage).toHaveBeenNthCalledWith(2, 'conversation-1', {
      limit: 80,
      maxBytes: 4 * 1024 * 1024,
      direction: 'forward',
      mode: 'full-content',
    });
  });
});
