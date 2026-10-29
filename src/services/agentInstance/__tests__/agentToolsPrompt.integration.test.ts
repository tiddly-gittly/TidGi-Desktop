/**
 * Integration test: verify that builtin agent definitions with agentTools
 * produce prompt output with tool descriptions.
 *
 * This covers the exact host pipeline: builtin Core profile -> persisted
 * Desktop conversation -> Core-owned preview session -> prompt plugin output.
 */
import { mergeDesktopAgentToolsIntoFrameworkConfig } from '@services/agentDefinition/frameworkConfig';
import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import type { IAgentInstanceService } from '@services/agentInstance/interface';
import { container } from '@services/container';
import type { IDatabaseService } from '@services/database/interface';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import { i18n } from '@services/libs/i18n';
import serviceIdentifier from '@services/serviceIdentifier';
import { createInstance } from 'i18next';
import type { AgentDefinition, PromptPreviewPreparedExecution } from 'memeloop';
import { getBuiltinLoopProfiles } from 'memeloop';
import { nanoid } from 'nanoid';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import english from '../../../../localization/locales/en/agent.json';
import chinese from '../../../../localization/locales/zh-Hans/agent.json';

const translations = createInstance();

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
    await translations.init({
      lng: 'en',
      defaultNS: 'agent',
      resources: { en: { agent: english }, 'zh-Hans': { agent: chinese } },
      interpolation: { escapeValue: false },
    });
    await container.get<IDatabaseService>(serviceIdentifier.Database).initializeForApp();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(i18n, 't').mockImplementation(translations.t.bind(translations));
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
    const mergedConfig = mergeDesktopAgentToolsIntoFrameworkConfig(
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
    let allContent: string;
    try {
      allContent = await readRequest(agentInstanceService, prepared);
    } finally {
      await agentInstanceService.releasePromptPreviewAuditSession({
        sessionId: prepared.sessionId,
        expectedRevision: prepared.revision,
      });
    }

    expect(allContent).toContain('spawn-agent');
    expect(allContent).toContain('## ask-question');
    expect(allContent).toContain('manage-todo');
    expect(allContent).toContain('**Description**');
  }, 30_000);

  it('removes an explicitly disabled Desktop wiki tool from the generated request', async () => {
    const profile = getBuiltinLoopProfiles().find(agent => agent.id === 'memeloop:general-assistant');
    if (!profile) throw new Error('Missing built-in general assistant profile');
    const definition: AgentDefinition = {
      ...toAgentDefinition(profile),
      modelConfig: { providerId: 'mock', modelId: 'mock-model' },
      agentTools: [{ toolId: 'wikiSearch', enabled: true }],
      agentFrameworkConfig: {
        ...profile.agentFrameworkConfig,
        prompts: profile.agentFrameworkConfig?.prompts ?? [],
        plugins: [{ id: 'wiki-search-editor', toolId: 'wikiSearch', enabled: false }],
      },
    };
    vi.spyOn(agentDefinitionService, 'getAgentDef').mockResolvedValue(definition);

    const agent = await agentInstanceService.createAgent(definition.id, { id: nanoid() });
    const mergedConfig = mergeDesktopAgentToolsIntoFrameworkConfig(
      definition.agentFrameworkConfig,
      definition.agentTools,
    );
    expect(mergedConfig.plugins.find(plugin => plugin.toolId === 'wikiSearch')).toMatchObject({ enabled: false });

    const prepared = await agentInstanceService.preparePromptPreviewExecutionModelRequest({
      requestId: `agent-tools-disabled:${nanoid()}`,
      conversationId: agent.id,
      inputText: '帮我搜一下 wiki 里的笔记',
    });
    let allContent: string;
    try {
      allContent = await readRequest(agentInstanceService, prepared);
    } finally {
      await agentInstanceService.releasePromptPreviewAuditSession({
        sessionId: prepared.sessionId,
        expectedRevision: prepared.revision,
      });
    }

    expect(allContent).not.toContain('wiki-search');
  }, 30_000);

  it.each(['en', 'zh-Hans'])('prepares readable tool descriptions in both request messages and native tools (%s)', async language => {
    await translations.changeLanguage(language);
    const profile = getBuiltinLoopProfiles().find(agent => agent.id === 'memeloop:general-assistant');
    if (!profile) throw new Error('Missing built-in general assistant profile');
    const definition: AgentDefinition = {
      ...toAgentDefinition(profile),
      modelConfig: { providerId: 'mock', modelId: 'mock-model' },
      agentTools: [],
      agentFrameworkConfig: {
        ...profile.agentFrameworkConfig,
        prompts: [{ id: 'localized-tools', text: 'Available tools', enabled: true }],
        plugins: [{
          id: 'localized-wiki-search',
          toolId: 'wikiSearch',
          enabled: true,
          wikiSearchParam: { sourceType: 'wiki', toolListPosition: { targetId: 'localized-tools', position: 'after' } },
        }],
      },
    };
    vi.spyOn(agentDefinitionService, 'getAgentDef').mockResolvedValue(definition);
    const agent = await agentInstanceService.createAgent(definition.id, { id: nanoid() });
    const execution = await agentInstanceService.preparePromptPreviewExecutionModelRequest({
      requestId: `localized-tools:${nanoid()}`,
      conversationId: agent.id,
      inputText: 'Show the available wiki tools',
    });
    try {
      const request = JSON.parse(await readRequest(agentInstanceService, execution)) as { messages: unknown; tools: unknown };
      const description = translations.t('Schema.WikiSearch.Tool.Description');
      const parameterDescription = translations.t('Schema.WikiSearch.Tool.Parameters.workspaceName.Description');
      for (const value of [request.messages, request.tools]) {
        const text = JSON.stringify(value);
        expect(text).toContain(description);
        expect(text).toContain(parameterDescription);
        expect(text).not.toContain('Schema.WikiSearch.');
      }
    } finally {
      await agentInstanceService.releasePromptPreviewAuditSession({ sessionId: execution.sessionId, expectedRevision: execution.revision });
    }
  }, 30_000);
});

async function readRequest(service: IAgentInstanceService, execution: PromptPreviewPreparedExecution): Promise<string> {
  let text = '';
  let cursor: string | undefined;
  do {
    const chunk = await service.getPromptPreviewAuditDetail({
      sessionId: execution.sessionId,
      expectedRevision: execution.revision,
      target: { kind: 'request' },
      maxBytes: 64 * 1_024,
      ...(cursor === undefined ? {} : { cursor }),
    });
    text += new TextDecoder().decode(chunk.canonicalUtf8);
    cursor = chunk.nextCursor;
  } while (cursor !== undefined);
  return text;
}
