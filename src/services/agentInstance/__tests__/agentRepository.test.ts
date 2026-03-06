import { Repository } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';

import type { AgentDefinition, IAgentDefinitionService } from '@services/agentDefinition/interface';
import type { AgentInstanceEntity } from '@services/database/schema/agent';
import { createAgent } from '../agentRepository';

describe('agentRepository.createAgent', () => {
  const mockDefinition: AgentDefinition = {
    id: 'agent-def-1',
    name: 'Test Agent',
    avatarUrl: 'avatar.png',
    aiApiConfig: { default: { provider: 'openai', model: 'gpt-5.3-codex' } },
    agentFrameworkID: 'basicPromptConcatHandler',
    agentFrameworkConfig: {},
  };

  const createMockRepo = () => {
    const createMock = vi.fn((data: unknown) => data as AgentInstanceEntity);
    const saveMock = vi.fn(async (data: unknown) => data as AgentInstanceEntity);
    return {
      repo: {
        create: createMock,
        save: saveMock,
      } as unknown as Repository<AgentInstanceEntity>,
      createMock,
      saveMock,
    };
  };

  const createMockDefinitionService = (): IAgentDefinitionService => ({
    getAgentDef: vi.fn(async () => mockDefinition),
  } as unknown as IAgentDefinitionService);

  it('marks instance as volatile when options.volatile is true', async () => {
    const { repo, createMock, saveMock } = createMockRepo();
    const definitionService = createMockDefinitionService();

    const created = await createAgent(
      repo,
      definitionService,
      mockDefinition.id,
      { volatile: true },
    );

    expect(created.volatile).toBe(true);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it('marks instance as volatile when options.preview is true', async () => {
    const { repo, createMock, saveMock } = createMockRepo();
    const definitionService = createMockDefinitionService();

    const created = await createAgent(
      repo,
      definitionService,
      mockDefinition.id,
      { preview: true },
    );

    expect(created.volatile).toBe(true);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it('does not mark instance as volatile by default', async () => {
    const { repo, createMock, saveMock } = createMockRepo();
    const definitionService = createMockDefinitionService();

    const created = await createAgent(
      repo,
      definitionService,
      mockDefinition.id,
    );

    expect(created.volatile).not.toBe(true);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledTimes(1);
  });
});
