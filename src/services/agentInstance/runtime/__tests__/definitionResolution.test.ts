import type { AgentDefinition, AgentFrameworkConfig, AgentRuntimeView } from 'memeloop';
import { describe, expect, it, vi } from 'vitest';

import { AgentDefinitionService } from '@services/agentDefinition';
import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import { AgentInstanceService } from '../../index';
import type { IAgentInstanceService } from '../../interface';
import { createDesktopAgentDefinitionResolver, resolveDesktopAgentDefinition } from '../runtime';

type DefinitionServiceOverrides = Pick<IAgentDefinitionService, 'getAgentDef'>;
type InstanceServiceOverrides = Pick<IAgentInstanceService, 'getAgentMetadata'>;

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
      agentDefinitionService: createDefinitionService({ getAgentDef }),
      agentInstanceService: createInstanceService({ getAgentMetadata }),
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
      agentDefinitionService: createDefinitionService({
        getAgentDef: vi.fn(async () => definition),
      }),
      agentInstanceService: createInstanceService({
        getAgentMetadata: vi.fn(async () =>
          agentInstance({
            agentDefId: 'different-definition',
            agentFrameworkConfig: {
              prompts: [{ id: 'system', role: 'system', text: 'wrong prompt' }],
              plugins: [],
            },
          })
        ),
      }),
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
      agentDefinitionService: createDefinitionService({
        getAgentDef: vi.fn(async () => definition),
      }),
      agentInstanceService: createInstanceService({ getAgentMetadata }),
    });

    await resolver(definition.id, { conversationId: 'real-conversation' });

    expect(getAgentMetadata).toHaveBeenCalledWith('real-conversation');
  });
});

function agentInstance(overrides: Partial<AgentRuntimeView>): AgentRuntimeView {
  return {
    id: 'conversation-1',
    agentDefId: 'definition-1',
    name: 'Conversation',
    status: { state: 'working', modified: new Date(0) },
    created: new Date(0),
    closed: false,
    volatile: false,
    preview: false,
    ...overrides,
  };
}
