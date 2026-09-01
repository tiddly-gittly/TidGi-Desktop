import { act, renderHook, waitFor } from '@testing-library/react';
import type { AgentModelConfig, ModelAssignments, ProviderAccountConfig } from 'memeloop';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAIConfigManagement } from '../useAIConfigManagement';

const assignments: ModelAssignments = {
  default: {
    providerId: 'openai-main',
    modelId: 'reasoning',
    parameters: {
      temperature: 0.7,
      topP: 0.95,
      maxOutputTokens: 4096,
      reasoningEffort: 'high',
    },
  },
};

const accounts: ProviderAccountConfig[] = [{
  providerId: 'openai-main',
  providerType: 'openai',
  enabled: true,
  secretRef: 'desktop-keychain:openai-main',
  models: [
    { modelId: 'reasoning', wireModelId: 'gpt-5.6', apiMode: 'responses' },
    { modelId: 'fast', wireModelId: 'gpt-5.6-mini', apiMode: 'responses' },
  ],
}];

describe('useAIConfigManagement', () => {
  let configSubject: BehaviorSubject<ModelAssignments>;
  let accountsSubject: BehaviorSubject<ProviderAccountConfig[]>;
  let getAIConfig: ReturnType<typeof vi.fn<() => Promise<ModelAssignments>>>;
  let getProviderAccounts: ReturnType<typeof vi.fn<() => Promise<ProviderAccountConfig[]>>>;
  let updateDefaultAIConfig: ReturnType<typeof vi.fn<(config: ModelAssignments) => Promise<void>>>;
  let log: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    configSubject = new BehaviorSubject(assignments);
    accountsSubject = new BehaviorSubject(accounts);
    getAIConfig = vi.fn().mockResolvedValue(assignments);
    getProviderAccounts = vi.fn().mockResolvedValue(accounts);
    updateDefaultAIConfig = vi.fn().mockResolvedValue(undefined);
    log = vi.fn();

    Object.defineProperties(window.service.externalAPI, {
      getAIConfig: { value: getAIConfig, writable: true },
      getProviderAccounts: { value: getProviderAccounts, writable: true },
      updateDefaultAIConfig: { value: updateDefaultAIConfig, writable: true },
    });
    Object.defineProperty(window.observables, 'externalAPI', {
      value: {
        defaultConfig$: configSubject,
        providerAccounts$: accountsSubject,
      },
      writable: true,
    });
    Object.defineProperty(window.service.native, 'log', { value: log, writable: true });
  });

  it('loads and observes exact provider accounts and model assignments', async () => {
    const { result } = renderHook(() => useAIConfigManagement());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.config).toEqual(assignments);
    expect(result.current.accounts).toEqual(accounts);
    expect(getAIConfig).toHaveBeenCalledOnce();
    expect(getProviderAccounts).toHaveBeenCalledOnce();

    const updatedAccounts: ProviderAccountConfig[] = [{
      providerId: '提供方2',
      providerType: 'openai-compatible',
      baseUrl: 'https://models.example.test/v1',
      models: [{ modelId: 'logical', wireModelId: 'vendor/model-v2', apiMode: 'chat-completions' }],
    }];
    act(() => {
      accountsSubject.next(updatedAccounts);
    });
    await waitFor(() => {
      expect(result.current.accounts).toEqual(updatedAccounts);
    });
    expect(result.current.accounts[0]?.providerId).toBe('提供方2');
  });

  it('preserves parameters while changing only the canonical default selection', async () => {
    const { result } = renderHook(() => useAIConfigManagement());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const selection: AgentModelConfig = { providerId: 'openai-main', modelId: 'fast' };
    await act(async () => result.current.handleModelChange(selection));

    const expected: ModelAssignments = {
      default: {
        ...selection,
        parameters: assignments.default?.parameters,
      },
    };
    expect(result.current.config).toEqual(expected);
    expect(updateDefaultAIConfig).toHaveBeenCalledWith(expected);
  });

  it('persists an instance override as one canonical AgentModelConfig', async () => {
    const updateAgent = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.service, 'agentInstance', {
      value: {
        getAgentMetadata: vi.fn().mockResolvedValue({
          id: 'conversation-1',
          agentDefId: 'definition-1',
          modelConfig: {
            providerId: 'openai-main',
            modelId: 'reasoning',
            parameters: { temperature: 0.3, reasoningEffort: 'medium' },
          },
        }),
        updateAgent,
      },
      writable: true,
    });

    const { result } = renderHook(() => useAIConfigManagement({ agentId: 'conversation-1' }));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => result.current.handleModelChange({ providerId: 'openai-main', modelId: 'fast' }));
    expect(updateAgent).toHaveBeenCalledWith('conversation-1', {
      modelConfig: {
        providerId: 'openai-main',
        modelId: 'fast',
        parameters: { temperature: 0.3, reasoningEffort: 'medium' },
      },
    });
  });

  it('does not let global observable updates overwrite an instance selection', async () => {
    Object.defineProperty(window.service, 'agentInstance', {
      value: {
        getAgentMetadata: vi.fn().mockResolvedValue({
          id: 'conversation-1',
          modelConfig: { providerId: 'openai-main', modelId: 'reasoning' },
        }),
      },
      writable: true,
    });
    const { result } = renderHook(() => useAIConfigManagement({ agentId: 'conversation-1' }));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      configSubject.next({ default: { providerId: 'openai-main', modelId: 'fast' } });
    });
    expect(result.current.config?.default?.modelId).toBe('reasoning');
  });

  it('unsubscribes both observables on unmount', async () => {
    const configSubscribe = vi.spyOn(configSubject, 'subscribe');
    const accountsSubscribe = vi.spyOn(accountsSubject, 'subscribe');
    const { unmount } = renderHook(() => useAIConfigManagement());
    await waitFor(() => {
      expect(configSubscribe).toHaveBeenCalledOnce();
    });

    const configSubscription = configSubscribe.mock.results[0]?.value;
    const accountsSubscription = accountsSubscribe.mock.results[0]?.value;
    const configUnsubscribe = vi.spyOn(configSubscription, 'unsubscribe');
    const accountsUnsubscribe = vi.spyOn(accountsSubscription, 'unsubscribe');
    unmount();

    expect(configUnsubscribe).toHaveBeenCalledOnce();
    expect(accountsUnsubscribe).toHaveBeenCalledOnce();
  });

  it('logs initialization failures and leaves loading state', async () => {
    getAIConfig.mockRejectedValueOnce(new Error('Failed to load'));
    const { result } = renderHook(() => useAIConfigManagement());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(log).toHaveBeenCalledWith(
      'error',
      'Failed to load AI configuration',
      expect.objectContaining({ function: 'useAIConfigManagement.fetchConfig' }),
    );
  });
});
