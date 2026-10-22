import type { AgentModelConfig, ProviderAccountConfig } from 'memeloop';
import { describe, expect, it, vi } from 'vitest';
import { createDesktopConversationModelParameters } from '../conversationModelParameters';

const selection: AgentModelConfig = { providerId: 'provider', modelId: 'model', parameters: { topP: 0.7, reasoningEffort: 'high' } };
const accounts: ProviderAccountConfig[] = [{
  providerId: 'provider',
  providerType: 'openai',
  secretRef: 'private-reference',
  baseUrl: 'https://private-host',
  models: [{ modelId: 'model', wireModelId: 'wire', apiMode: 'responses', requestDefaults: { temperature: 0.4, maxOutputTokens: 1234 } }],
  catalogProvider: {
    id: 'catalog',
    name: 'Catalog',
    env: ['PRIVATE_API_KEY'],
    models: [{ id: 'model', name: 'Model', reasoning: true, reasoningEfforts: ['low', 'high'], attachment: false, toolCall: true, temperature: true, limit: { output: 4321 } }],
  },
}];

function fixture() {
  let override: AgentModelConfig | undefined;
  const updateAgent = vi.fn(async (_id: string, update: { modelConfig?: AgentModelConfig }) => {
    override = update.modelConfig;
  });
  const options = {
    agentInstanceService: {
      getAgentMetadata: vi.fn(async () => ({ id: 'conversation', agentDefId: 'definition', modelConfig: override })),
      updateAgent,
    },
    agentDefinitionService: { getAgentDef: vi.fn().mockResolvedValue({ id: 'definition' }) },
    externalAPIService: { getAIConfig: vi.fn().mockResolvedValue({ default: selection }), getProviderAccounts: vi.fn().mockResolvedValue(accounts) },
  };
  // Only the narrow service methods above are exercised by this adapter.
  const host = createDesktopConversationModelParameters(options as unknown as Parameters<typeof createDesktopConversationModelParameters>[0]);
  return { host, options, updateAgent };
}

describe('Desktop conversation model parameter host', () => {
  it('resolves actual inherited config and route defaults without exposing credentials', async () => {
    const { host } = fixture();
    const result = await host.get('conversation');
    expect(result.selection.parameters).toEqual({ temperature: 0.4, maxOutputTokens: 1234, topP: 0.7, reasoningEffort: 'high' });
    expect(result.model?.reasoningEfforts).toEqual(['low', 'high']);
    const json = JSON.stringify(result);
    expect(json).not.toContain('private');
    expect(json).not.toContain('PRIVATE_API_KEY');
    expect(json).not.toContain('wire');
  });

  it('persists only the selected conversation override and preserves other parameters', async () => {
    const { host, updateAgent, options } = fixture();
    const current = await host.get('conversation');
    const changed = { ...current.selection, parameters: { ...current.selection.parameters, reasoningEffort: 'low' as const } };
    expect((await host.set('conversation', changed)).selection).toEqual(changed);
    expect(updateAgent).toHaveBeenCalledWith('conversation', { modelConfig: changed });
    options.externalAPIService.getAIConfig.mockResolvedValue({ default: { providerId: 'new-global', modelId: 'different' } });
    expect((await host.get('conversation')).selection).toEqual(changed);
  });

  it('rejects stale model identities and unsupported values before mutating', async () => {
    const { host, updateAgent } = fixture();
    await expect(host.set('conversation', { ...selection, modelId: 'other' })).rejects.toThrow('conversation_model_changed');
    await expect(host.set('conversation', { ...selection, parameters: { reasoningEffort: 'minimal' } })).rejects.toThrow('conversation_model_reasoning_unsupported');
    await expect(host.set('conversation', { ...selection, parameters: { maxOutputTokens: 5000 } })).rejects.toThrow('conversation_model_output_limit');
    expect(updateAgent).not.toHaveBeenCalled();
  });
});
