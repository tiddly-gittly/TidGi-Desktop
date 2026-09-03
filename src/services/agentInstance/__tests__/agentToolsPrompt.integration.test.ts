/**
 * Integration test: verify that builtin agent definitions with agentTools
 * produce prompt output with tool descriptions.
 *
 * This covers the exact host pipeline: builtin Core profile -> persisted
 * Desktop conversation -> Core-owned preview session -> prompt plugin output.
 */
import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import type { IAgentInstanceService } from '@services/agentInstance/interface';
import { container } from '@services/container';
import type { IDatabaseService } from '@services/database/interface';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { AgentDefinition, PromptConcatStreamState } from 'memeloop';
import { getBuiltinLoopProfiles, mergeAgentToolsIntoFrameworkConfig } from 'memeloop';
import { nanoid } from 'nanoid';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

function toAgentDefinition(profile: ReturnType<typeof getBuiltinLoopProfiles>[number]): AgentDefinition {
  return {
    systemPrompt: '',
    tools: [],
    version: '1',
    ...profile,
  };
}

describe('default agent tools -> prompt integration', () => {
  let agentDefinitionService: IAgentDefinitionService;
  let agentInstanceService: IAgentInstanceService;
  let externalAPIService: Partial<IExternalAPIService>;

  beforeAll(async () => {
    await container.get<IDatabaseService>(serviceIdentifier.Database).initializeForApp();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    agentDefinitionService = container.get<IAgentDefinitionService>(serviceIdentifier.AgentDefinition);
    agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
    externalAPIService = container.get<IExternalAPIService>(serviceIdentifier.ExternalAPI);
    await agentDefinitionService.initialize();
    await agentInstanceService.initialize();

    externalAPIService.getAIConfig = vi.fn().mockResolvedValue({
      default: { providerId: 'mock', modelId: 'mock-model' },
    });
    externalAPIService.getProviderAccounts = vi.fn().mockResolvedValue([{
      providerId: 'mock',
      providerType: 'openai-compatible',
      enabled: true,
      secretRef: 'test://mock/api-key',
      models: [{ modelId: 'mock-model', wireModelId: 'mock-model', apiMode: 'chat-completions' }],
    }]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reflects the general-assistant agentTools in the exact Core preview result', async () => {
    const profile = getBuiltinLoopProfiles().find(agent => agent.id === 'memeloop:general-assistant');
    if (!profile) throw new Error('Missing built-in general assistant profile');
    const definition: AgentDefinition = {
      ...toAgentDefinition(profile),
      modelConfig: { providerId: 'mock', modelId: 'mock-model' },
    };
    vi.spyOn(agentDefinitionService, 'getAgentDef').mockResolvedValue(definition);

    const agent = await agentInstanceService.createAgent(definition.id, { id: nanoid() });
    const mergedConfig = mergeAgentToolsIntoFrameworkConfig(
      definition.agentFrameworkConfig,
      definition.agentTools,
    );
    const pluginToolIds = mergedConfig.plugins.map(plugin => plugin.toolId);
    for (const tool of definition.agentTools ?? []) expect(pluginToolIds).toContain(tool.toolId);
    expect(pluginToolIds).toContain('fullReplacement');

    const prepared = await agentInstanceService.preparePromptPreviewExecutionModelRequest({
      requestId: `agent-tools-prompt:${nanoid()}`,
      conversationId: agent.id,
      inputText: '帮我搜一下 wiki 里的笔记',
    });
    let lastCompleteState: PromptConcatStreamState | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        agentInstanceService.concatPromptPreview({
          sessionId: prepared.sessionId,
          expectedRevision: prepared.revision,
          agentFrameworkConfig: mergedConfig,
        }).subscribe({
          next: state => {
            if (state.isComplete) lastCompleteState = state;
          },
          error: reject,
          complete: resolve,
        });
      });
    } finally {
      await agentInstanceService.releasePromptPreviewAuditSession({
        sessionId: prepared.sessionId,
        expectedRevision: prepared.revision,
      });
    }

    expect(lastCompleteState).toBeDefined();
    const allContent = JSON.stringify(lastCompleteState?.flatPrompts);
    expect(allContent).toContain('spawn-agent');
    expect(allContent).toContain('## ask-question');
    expect(allContent).toContain('manage-todo');
    expect(allContent).toContain('**Description**');
  }, 30_000);
});
