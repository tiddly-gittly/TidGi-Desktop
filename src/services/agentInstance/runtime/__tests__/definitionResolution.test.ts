import type { AgentDefinition, AgentFrameworkConfig, AgentInstance } from 'memeloop';
import { describe, expect, it, vi } from 'vitest';

import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import type { IAgentInstanceService } from '../../interface';
import { createDesktopAgentDefinitionResolver, resolveDesktopAgentDefinition } from '../runtime';

describe('resolveDesktopAgentDefinition', () => {
  it('re-reads the latest persisted instance prompt config for the next Core turn', async () => {
    const definitionId = 'definition-1';
    const agentId = 'conversation-1';
    let persistedConfig: AgentFrameworkConfig = {
      prompts: [{ id: 'system', role: 'system', text: 'first persisted prompt' }],
      plugins: [],
    };
    const definition: AgentDefinition = {
      id: definitionId,
      name: 'Assistant',
      description: 'Base definition',
      systemPrompt: '',
      tools: [],
      agentFrameworkConfig: {
        prompts: [{ id: 'system', role: 'system', text: 'definition fallback' }],
        plugins: [],
      },
      version: '1',
    };
    const getAgentDef = vi.fn(async () => definition);
    const getAgentMetadata = vi.fn(async () =>
      agentInstance({
        id: agentId,
        agentDefId: definitionId,
        agentFrameworkConfig: persistedConfig,
      })
    );
    const services = {
      agentId,
      definitionId,
      agentDefinitionService: { getAgentDef } as unknown as IAgentDefinitionService,
      agentInstanceService: { getAgentMetadata } as unknown as IAgentInstanceService,
    };

    const firstTurnDefinition = await resolveDesktopAgentDefinition(services);
    persistedConfig = {
      prompts: [{ id: 'system', role: 'system', text: 'second persisted prompt' }],
      plugins: [],
    };
    const secondTurnDefinition = await resolveDesktopAgentDefinition(services);

    expect(firstTurnDefinition?.agentFrameworkConfig?.prompts[0]?.text).toBe('first persisted prompt');
    expect(secondTurnDefinition?.agentFrameworkConfig?.prompts[0]?.text).toBe('second persisted prompt');
    expect(getAgentDef).toHaveBeenCalledTimes(2);
    expect(getAgentMetadata).toHaveBeenCalledTimes(2);
  });

  it('does not leak overrides from a conversation bound to another definition', async () => {
    const definition: AgentDefinition = {
      id: 'definition-1',
      name: 'Assistant',
      description: 'Base definition',
      systemPrompt: '',
      tools: [],
      agentFrameworkConfig: {
        prompts: [{ id: 'system', role: 'system', text: 'definition prompt' }],
        plugins: [],
      },
      version: '1',
    };

    const resolved = await resolveDesktopAgentDefinition({
      agentId: 'conversation-1',
      definitionId: definition.id,
      agentDefinitionService: {
        getAgentDef: vi.fn(async () => definition),
      } as unknown as IAgentDefinitionService,
      agentInstanceService: {
        getAgentMetadata: vi.fn(async () =>
          agentInstance({
            agentDefId: 'different-definition',
            agentFrameworkConfig: {
              prompts: [{ id: 'system', role: 'system', text: 'wrong prompt' }],
              plugins: [],
            },
          })
        ),
      } as unknown as IAgentInstanceService,
    });

    expect(resolved?.agentFrameworkConfig?.prompts[0]?.text).toBe('definition prompt');
  });

  it('uses the per-turn conversation identity supplied by a shared Core runtime', async () => {
    const definition: AgentDefinition = {
      id: 'definition-1',
      name: 'Assistant',
      description: 'Base definition',
      systemPrompt: '',
      tools: [],
      version: '1',
    };
    const getAgentMetadata = vi.fn(async (agentId: string) => agentInstance({ id: agentId }));
    const resolver = createDesktopAgentDefinitionResolver({
      fallbackAgentId: '__memeloop_runtime__',
      agentDefinitionService: {
        getAgentDef: vi.fn(async () => definition),
      } as unknown as IAgentDefinitionService,
      agentInstanceService: { getAgentMetadata } as unknown as IAgentInstanceService,
    });

    await resolver(definition.id, { conversationId: 'real-conversation' });

    expect(getAgentMetadata).toHaveBeenCalledWith('real-conversation');
  });
});

function agentInstance(overrides: Partial<AgentInstance>): AgentInstance {
  return {
    id: 'conversation-1',
    agentDefId: 'definition-1',
    description: '',
    systemPrompt: '',
    tools: [],
    messages: [],
    status: { state: 'working', modified: new Date(0) },
    created: new Date(0),
    version: '1',
    ...overrides,
  };
}
