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

  it('bounds and de-duplicates definition and model selectors', async () => {
    const definitions = Array.from({ length: WIKI_AGENT_HOST_LIMITS.agentDefinitions + 20 }, (_, index) => ({
      id: `definition-${index}`,
      name: `Definition ${index}`,
      agentFrameworkConfig: {},
    }));
    definitions.push(definitions[0]);
    const models = Array.from({ length: WIKI_AGENT_HOST_LIMITS.modelOptions + 20 }, (_, index) => ({ name: `model-${index}` }));
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
      getAIProviders: vi.fn(async () => [
        { provider: 'disabled', enabled: false, models: [{ name: 'hidden' }] },
        { provider: 'provider', enabled: true, models: [...models, models[0]] },
      ]),
      getAIConfig: vi.fn(async () => ({ default: { provider: 'provider', model: 'model-1' }, modelParameters: {} })),
    };
    mutableService.context = { get: vi.fn() };
    mutableService.deepLink = { openDeepLink: vi.fn() };
    const adapter = createDesktopWikiAgentHostAdapter();

    await expect(adapter.listAgentDefinitions({ signal: new AbortController().signal }))
      .resolves.toHaveLength(WIKI_AGENT_HOST_LIMITS.agentDefinitions);
    const selection = await adapter.getModelSelection(
      'agent-1',
      'definition-1',
      { signal: new AbortController().signal },
    );
    expect(selection.options).toHaveLength(WIKI_AGENT_HOST_LIMITS.modelOptions);
    expect(selection.options.some(option => option.providerId === 'disabled')).toBe(false);
    expect(selection.selectedId).toBe(JSON.stringify(['provider', 'model-1']));
  });

  it('preserves instance model parameters and fences an aborted selection', async () => {
    const updateAgent = vi.fn(async () => ({ id: 'agent-1' }));
    mutableService.agentDefinition = { getAgentDefs: vi.fn(), getAgentDef: vi.fn() };
    mutableService.agentInstance = {
      getAgentMetadata: vi.fn(async () => ({
        id: 'agent-1',
        modelConfig: { providerId: 'old', modelId: 'old', parameters: { temperature: 0.25 } },
      })),
      createAgent: vi.fn(),
      updateAgent,
    };
    mutableService.externalAPI = { getAIProviders: vi.fn(), getAIConfig: vi.fn() };
    mutableService.context = { get: vi.fn() };
    mutableService.deepLink = { openDeepLink: vi.fn() };
    const adapter = createDesktopWikiAgentHostAdapter();
    await adapter.selectModel('agent-1', {
      id: 'next',
      label: 'Next',
      providerId: 'provider-next',
      modelId: 'model-next',
    }, { signal: new AbortController().signal });

    expect(updateAgent).toHaveBeenCalledWith('agent-1', {
      modelConfig: {
        providerId: 'provider-next',
        modelId: 'model-next',
        parameters: { temperature: 0.25 },
      },
    });

    const aborted = new AbortController();
    aborted.abort();
    await expect(adapter.selectModel('agent-1', {
      id: 'unreachable',
      label: 'Unreachable',
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
    mutableService.externalAPI = { getAIProviders: vi.fn(), getAIConfig: vi.fn() };
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
});
