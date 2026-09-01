import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDesktopWikiAgentHostAdapter, WIKI_AGENT_HOST_LIMITS, WikiAgentHostUnavailableError } from './hostAdapter';

describe('Desktop Wiki agent host adapter', () => {
  const mutableService = window.service as unknown as Record<string, unknown>;
  let original: Record<string, unknown>;

  beforeEach(() => {
    original = { ...mutableService };
  });

  afterEach(() => {
    for (const key of Object.keys(mutableService)) delete mutableService[key];
    Object.assign(mutableService, original);
    vi.restoreAllMocks();
  });

  it('fails closed before any missing host method is invoked', async () => {
    mutableService.agentDefinition = undefined;
    mutableService.agentInstance = undefined;
    mutableService.externalAPI = undefined;
    const adapter = createDesktopWikiAgentHostAdapter();

    expect(adapter.isReady()).toBe(false);
    await expect(adapter.listAgentDefinitions({ signal: new AbortController().signal }))
      .rejects.toBeInstanceOf(WikiAgentHostUnavailableError);
  });

  it('returns the canonical session target instead of a Wiki conversation DTO', async () => {
    mutableService.agentDefinition = { getAgentDefs: vi.fn(), getAgentDef: vi.fn() };
    mutableService.agentInstance = { getAgents: vi.fn(), createAgent: vi.fn(), updateAgent: vi.fn() };
    mutableService.externalAPI = { getProviderAccounts: vi.fn(), getProviderCatalog: vi.fn(), getAIConfig: vi.fn() };
    mutableService.context = { get: vi.fn() };
    mutableService.deepLink = { openDeepLink: vi.fn() };

    await expect(
      createDesktopWikiAgentHostAdapter().resolveAgentTarget(
        'conversation-1',
        { signal: new AbortController().signal },
      ),
    ).resolves.toEqual({ agentId: 'conversation-1', conversationId: 'conversation-1' });
  });

  it('bounds and de-duplicates definition and model selectors', async () => {
    const definitions = Array.from({ length: WIKI_AGENT_HOST_LIMITS.agentDefinitions + 20 }, (_, index) => ({
      id: `definition-${index}`,
      name: `Definition ${index}`,
      agentFrameworkConfig: {},
    }));
    definitions.push(definitions[0]);
    const routes = Array.from({ length: WIKI_AGENT_HOST_LIMITS.modelOptions + 20 }, (_, index) => ({
      modelId: `model-${index}`,
      wireModelId: `wire-model-${index}`,
      apiMode: 'responses' as const,
    }));
    const selected = { providerId: 'provider', modelId: 'model-1', parameters: { reasoningEffort: 'high' as const } };
    mutableService.agentDefinition = {
      getAgentDefs: vi.fn(async () => definitions),
      getAgentDef: vi.fn(async () => undefined),
    };
    mutableService.agentInstance = {
      getAgentMetadata: vi.fn(async () => ({ id: 'agent-1', agentDefId: 'definition-1' })),
      createAgent: vi.fn(),
      updateAgent: vi.fn(),
    };
    mutableService.externalAPI = {
      getProviderAccounts: vi.fn(async () => [
        {
          providerId: 'disabled',
          providerType: 'openai-compatible',
          enabled: false,
          models: [{ modelId: 'hidden', wireModelId: 'hidden', apiMode: 'chat-completions' }],
        },
        { providerId: 'provider', providerType: 'openai-compatible', enabled: true, models: [...routes, routes[0]] },
      ]),
      getProviderCatalog: vi.fn(async () => ({
        source: 'embedded',
        stale: false,
        catalog: {
          schemaVersion: 1,
          source: 'https://models.dev/api.json',
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
        },
      })),
      getAIConfig: vi.fn(async () => ({ default: selected })),
    };
    mutableService.context = { get: vi.fn() };
    mutableService.deepLink = { openDeepLink: vi.fn() };
    const adapter = createDesktopWikiAgentHostAdapter();

    const definitionOptions = await adapter.listAgentDefinitions({ signal: new AbortController().signal });
    expect(definitionOptions).toHaveLength(WIKI_AGENT_HOST_LIMITS.agentDefinitions);
    expect(definitionOptions[0]?.definition).toBe(definitions[0]);
    const selection = await adapter.getModelSelection(
      'agent-1',
      'definition-1',
      { signal: new AbortController().signal },
    );
    expect(selection.options).toHaveLength(WIKI_AGENT_HOST_LIMITS.modelOptions);
    expect(selection.options.some(option => option.selection.providerId === 'disabled')).toBe(false);
    expect(selection.selected).toBe(selected);
    expect(selection.options[0]?.route).toBe(routes[0]);
    expect(selection.options[1]?.selection).toBe(selected);
    expect(selection.options[1]).toMatchObject({
      label: 'Provider caption · Model caption',
      catalogModel: { id: 'model-1' },
      provider: { id: 'provider' },
    });
  });

  it('passes the selected canonical model config through unchanged and fences an aborted selection', async () => {
    let receivedSelection: unknown;
    const updateAgent = vi.fn(async (_agentId: string, update: { modelConfig?: unknown }) => {
      receivedSelection = update.modelConfig;
      return { id: 'agent-1' };
    });
    mutableService.agentDefinition = { getAgentDefs: vi.fn(), getAgentDef: vi.fn() };
    mutableService.agentInstance = {
      getAgentMetadata: vi.fn(async () => ({ id: 'agent-1' })),
      createAgent: vi.fn(),
      updateAgent,
    };
    mutableService.externalAPI = { getProviderAccounts: vi.fn(), getProviderCatalog: vi.fn(), getAIConfig: vi.fn() };
    mutableService.context = { get: vi.fn() };
    mutableService.deepLink = { openDeepLink: vi.fn() };
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
    mutableService.agentDefinition = { getAgentDefs: vi.fn(), getAgentDef };
    mutableService.agentInstance = { getAgentMetadata, createAgent: vi.fn(), updateAgent: vi.fn() };
    mutableService.externalAPI = { getProviderAccounts: vi.fn(), getProviderCatalog: vi.fn(), getAIConfig: vi.fn() };
    mutableService.context = { get: vi.fn() };
    mutableService.deepLink = { openDeepLink: vi.fn() };
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
    mutableService.agentDefinition = { getAgentDefs: vi.fn(), getAgentDef: vi.fn() };
    mutableService.agentInstance = { getAgents: vi.fn(), createAgent: vi.fn(), updateAgent: vi.fn() };
    mutableService.externalAPI = { getProviderAccounts: vi.fn(), getProviderCatalog: vi.fn(), getAIConfig: vi.fn() };
    mutableService.context = { get: vi.fn(async () => true) };
    mutableService.deepLink = { openDeepLink };

    await createDesktopWikiAgentHostAdapter().openSettings(target);

    expect(openDeepLink).toHaveBeenCalledWith(expected);
  });
});
