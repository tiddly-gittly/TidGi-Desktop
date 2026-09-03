import type { AgentModelConfig } from 'memeloop';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDesktopWikiAgentHostAdapter, WIKI_AGENT_HOST_LIMITS, WikiAgentHostUnavailableError } from './hostAdapter';

interface TestAgentDefinition {
  id: string;
  name?: string;
  agentFrameworkConfig?: Record<string, unknown>;
}

interface TestAgentDefinitionService {
  getAgentDefs: () => Promise<readonly TestAgentDefinition[]>;
  getAgentDef: (definitionId?: string) => Promise<TestAgentDefinition | undefined>;
}

interface TestAgentMetadata {
  id: string;
  agentDefId?: string;
  agentFrameworkConfig?: Record<string, unknown>;
  modelConfig?: AgentModelConfig;
}

interface TestAgentInstanceService {
  getAgents?: () => unknown;
  getAgentMetadata?: (agentId: string) => Promise<TestAgentMetadata | undefined>;
  createAgent: (definitionId: string) => Promise<{ id: string }>;
  updateAgent: (agentId: string, update: { modelConfig?: AgentModelConfig }) => Promise<{ id: string }>;
}

interface TestExternalAPIService {
  getProviderAccounts: () => Promise<readonly unknown[]>;
  getProviderCatalog: () => Promise<unknown>;
  getAIConfig: () => Promise<unknown>;
}

interface TestContextService {
  get: (key: string) => Promise<unknown>;
}

interface TestDeepLinkService {
  openDeepLink: (url: string) => Promise<void>;
}

type TestServiceParts = {
  agentDefinition: TestAgentDefinitionService | undefined;
  agentInstance: TestAgentInstanceService | undefined;
  externalAPI: TestExternalAPIService | undefined;
  context: TestContextService | undefined;
  deepLink: TestDeepLinkService | undefined;
};

const testServiceKeys = ['agentDefinition', 'agentInstance', 'externalAPI', 'context', 'deepLink'] as const;

function setService<K extends keyof TestServiceParts>(key: K, value: TestServiceParts[K]): void {
  Object.defineProperty(window.service, key, {
    value,
    writable: true,
    configurable: true,
  });
}

describe('Desktop Wiki agent host adapter', () => {
  let original: { [K in keyof TestServiceParts]: unknown };

  beforeEach(() => {
    original = {
      agentDefinition: window.service.agentDefinition,
      agentInstance: window.service.agentInstance,
      externalAPI: window.service.externalAPI,
      context: window.service.context,
      deepLink: window.service.deepLink,
    };
  });

  afterEach(() => {
    for (const key of testServiceKeys) {
      Object.defineProperty(window.service, key, {
        value: original[key],
        writable: true,
        configurable: true,
      });
    }
    vi.restoreAllMocks();
  });

  it('fails closed before any missing host method is invoked', async () => {
    setService('agentDefinition', undefined);
    setService('agentInstance', undefined);
    setService('externalAPI', undefined);
    const adapter = createDesktopWikiAgentHostAdapter();

    expect(adapter.isReady()).toBe(false);
    await expect(adapter.listAgentDefinitions({ signal: new AbortController().signal }))
      .rejects.toBeInstanceOf(WikiAgentHostUnavailableError);
  });

  it('returns the canonical session target instead of a Wiki conversation DTO', async () => {
    setService('agentDefinition', { getAgentDefs: vi.fn(), getAgentDef: vi.fn() });
    setService('agentInstance', { getAgents: vi.fn(), createAgent: vi.fn(), updateAgent: vi.fn() });
    setService('externalAPI', { getProviderAccounts: vi.fn(), getProviderCatalog: vi.fn(), getAIConfig: vi.fn() });
    setService('context', { get: vi.fn() });
    setService('deepLink', { openDeepLink: vi.fn() });

    await expect(
      createDesktopWikiAgentHostAdapter().resolveAgentTarget(
        'conversation-1',
        { signal: new AbortController().signal },
      ),
    ).resolves.toEqual({ agentId: 'conversation-1', conversationId: 'conversation-1' });
  });

  it('bounds and de-duplicates definitions while exposing canonical provider records', async () => {
    const definitions = Array.from({ length: WIKI_AGENT_HOST_LIMITS.agentDefinitions + 20 }, (_, index) => ({
      id: `definition-${index}`,
      name: `Definition ${index}`,
      agentFrameworkConfig: {},
    }));
    definitions.splice(1, 0, definitions[0]);
    const routes = Array.from({ length: WIKI_AGENT_HOST_LIMITS.modelOptions + 20 }, (_, index) => ({
      modelId: `model-${index}`,
      wireModelId: `wire-model-${index}`,
      apiMode: 'responses' as const,
    }));
    const selected = { providerId: 'provider', modelId: 'model-1', parameters: { reasoningEffort: 'high' as const } };
    const accounts = [
      {
        providerId: 'disabled',
        providerType: 'openai-compatible',
        enabled: false,
        models: [{ modelId: 'hidden', wireModelId: 'hidden', apiMode: 'chat-completions' as const }],
      },
      { providerId: 'provider', providerType: 'openai-compatible', enabled: true, models: [...routes, routes[0]] },
    ];
    const catalog = {
      schemaVersion: 1 as const,
      source: 'https://models.dev/api.json' as const,
      catalogVersion: 'test',
      fetchedAt: '2026-08-31T00:00:00.000Z',
      providers: [{
        id: 'provider',
        name: 'Provider caption',
        env: [],
        models: [{
          id: 'model-1',
          name: 'Model caption',
          attachment: true,
          reasoning: true,
          toolCall: true,
        }],
      }],
    };
    setService('agentDefinition', {
      getAgentDefs: vi.fn(async () => definitions),
      getAgentDef: vi.fn(async () => undefined),
    });
    setService('agentInstance', {
      getAgentMetadata: vi.fn(async () => ({ id: 'agent-1', agentDefId: 'definition-1' })),
      createAgent: vi.fn(),
      updateAgent: vi.fn(),
    });
    setService('externalAPI', {
      getProviderAccounts: vi.fn(async () => accounts),
      getProviderCatalog: vi.fn(async () => ({
        source: 'embedded',
        stale: false,
        catalog,
      })),
      getAIConfig: vi.fn(async () => ({ default: selected })),
    });
    setService('context', { get: vi.fn() });
    setService('deepLink', { openDeepLink: vi.fn() });
    const adapter = createDesktopWikiAgentHostAdapter();

    const definitionOptions = await adapter.listAgentDefinitions({ signal: new AbortController().signal });
    expect(definitionOptions).toHaveLength(WIKI_AGENT_HOST_LIMITS.agentDefinitions);
    expect(definitionOptions[0]).toBe(definitions[0]);
    expect(definitionOptions[1]).toBe(definitions[2]);

    const selection = await adapter.getModelConfig(
      'agent-1',
      'definition-1',
      { signal: new AbortController().signal },
    );
    expect(selection).toBe(selected);

    const accountRecords = await adapter.listProviderAccounts({ signal: new AbortController().signal });
    expect(accountRecords).toBe(accounts);
    expect(accountRecords).toHaveLength(2);
    expect(accountRecords[0]?.enabled).toBe(false);

    const catalogRecord = await adapter.getProviderCatalog({ signal: new AbortController().signal });
    expect(catalogRecord).toBe(catalog);
    expect(catalogRecord.providers[0]?.models[0]?.id).toBe('model-1');
  });

  it('passes the selected canonical model config through unchanged and fences an aborted selection', async () => {
    let receivedSelection: unknown;
    const updateAgent = vi.fn(async (_agentId: string, update: { modelConfig?: AgentModelConfig }) => {
      receivedSelection = update.modelConfig;
      return { id: 'agent-1' };
    });
    setService('agentDefinition', { getAgentDefs: vi.fn(), getAgentDef: vi.fn() });
    setService('agentInstance', {
      getAgentMetadata: vi.fn(async () => ({ id: 'agent-1' })),
      createAgent: vi.fn(),
      updateAgent,
    });
    setService('externalAPI', { getProviderAccounts: vi.fn(), getProviderCatalog: vi.fn(), getAIConfig: vi.fn() });
    setService('context', { get: vi.fn() });
    setService('deepLink', { openDeepLink: vi.fn() });
    const adapter = createDesktopWikiAgentHostAdapter();
    const selection = {
      providerId: 'provider-next',
      modelId: 'model-next',
      parameters: { temperature: 0.25, reasoningEffort: 'medium' as const },
    };
    await adapter.selectModel('agent-1', selection, { signal: new AbortController().signal });

    expect(updateAgent).toHaveBeenCalledWith('agent-1', { modelConfig: selection });
    expect(receivedSelection).toBe(selection);

    const aborted = new AbortController();
    aborted.abort();
    await expect(adapter.selectModel('agent-1', {
      providerId: 'unreachable',
      modelId: 'unreachable',
    }, { signal: aborted.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(updateAgent).toHaveBeenCalledTimes(1);
  });

  it('loads the effective prompt configuration without exposing persistence to the Wiki view', async () => {
    const getAgentMetadata = vi.fn()
      .mockResolvedValueOnce({
        id: 'agent-1',
        agentDefId: 'definition-1',
        agentFrameworkConfig: { prompts: [{ id: 'instance' }] },
      })
      .mockResolvedValueOnce({ id: 'agent-2', agentDefId: 'definition-2' });
    const getAgentDef = vi.fn(async () => ({
      id: 'definition-2',
      agentFrameworkConfig: { prompts: [{ id: 'definition' }] },
    }));
    setService('agentDefinition', { getAgentDefs: vi.fn(), getAgentDef });
    setService('agentInstance', { getAgentMetadata, createAgent: vi.fn(), updateAgent: vi.fn() });
    setService('externalAPI', { getProviderAccounts: vi.fn(), getProviderCatalog: vi.fn(), getAIConfig: vi.fn() });
    setService('context', { get: vi.fn() });
    setService('deepLink', { openDeepLink: vi.fn() });
    const adapter = createDesktopWikiAgentHostAdapter();

    await expect(adapter.getAgentFrameworkConfig(
      'agent-1',
      'definition-1',
      { signal: new AbortController().signal },
    )).resolves.toEqual({ prompts: [{ id: 'instance' }] });
    expect(getAgentDef).not.toHaveBeenCalled();

    await expect(adapter.getAgentFrameworkConfig(
      'agent-2',
      'definition-2',
      { signal: new AbortController().signal },
    )).resolves.toEqual({ prompts: [{ id: 'definition' }] });
    expect(getAgentDef).toHaveBeenCalledWith('definition-2');
  });

  it('preserves an explicitly empty instance framework config', async () => {
    const getAgentMetadata = vi.fn(async () => ({
      id: 'agent-empty',
      agentDefId: 'definition-empty',
      agentFrameworkConfig: {},
    }));
    const getAgentDef = vi.fn(async () => ({
      id: 'definition-empty',
      agentFrameworkConfig: { prompts: [{ id: 'definition' }] },
    }));
    setService('agentDefinition', { getAgentDefs: vi.fn(), getAgentDef });
    setService('agentInstance', { getAgentMetadata, createAgent: vi.fn(), updateAgent: vi.fn() });
    setService('externalAPI', { getProviderAccounts: vi.fn(), getProviderCatalog: vi.fn(), getAIConfig: vi.fn() });
    setService('context', { get: vi.fn() });
    setService('deepLink', { openDeepLink: vi.fn() });
    const adapter = createDesktopWikiAgentHostAdapter();

    const config = await adapter.getAgentFrameworkConfig(
      'agent-empty',
      'definition-empty',
      { signal: new AbortController().signal },
    );

    expect(config).toEqual({});
    expect(getAgentDef).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'provider field',
      target: { kind: 'provider' as const, providerId: '0提供方', field: 'apiKey' as const },
      expected: 'tidgi-test://preferences/externalAPI?provider=0%E6%8F%90%E4%BE%9B%E6%96%B9&field=apiKey',
    },
    {
      name: 'model',
      target: { kind: 'model' as const, providerId: 'provider', modelId: '模型/v2' },
      expected: 'tidgi-test://preferences/externalAPI?provider=provider&model=%E6%A8%A1%E5%9E%8B%2Fv2&field=model',
    },
    {
      name: 'network runtime',
      target: { kind: 'runtime' as const, section: 'network' as const },
      expected: 'tidgi-test://preferences/network',
    },
  ])('opens the exact $name settings target through the Desktop host', async ({ target, expected }) => {
    const openDeepLink = vi.fn(async () => undefined);
    setService('agentDefinition', { getAgentDefs: vi.fn(), getAgentDef: vi.fn() });
    setService('agentInstance', { getAgents: vi.fn(), createAgent: vi.fn(), updateAgent: vi.fn() });
    setService('externalAPI', { getProviderAccounts: vi.fn(), getProviderCatalog: vi.fn(), getAIConfig: vi.fn() });
    setService('context', { get: vi.fn(async () => true) });
    setService('deepLink', { openDeepLink });

    await createDesktopWikiAgentHostAdapter().openSettings(target);

    expect(openDeepLink).toHaveBeenCalledWith(expected);
  });
});
