import type { AgentInstance } from 'memeloop';
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
  });

  it('uses the local libp2p PeerId for conversation metadata', async () => {
    const currentAgent = {
      ...agent(),
      messages: [
        {
          messageId: 'local-message',
          conversationId: 'conversation-1',
          originNodeId: '12D3KooWDesktopPeer',
          timestamp: 2,
          lamportClock: 3,
          role: 'user' as const,
          content: 'local',
        },
        {
          messageId: 'remote-message',
          conversationId: 'conversation-1',
          originNodeId: '12D3KooWRemotePeer',
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
});
