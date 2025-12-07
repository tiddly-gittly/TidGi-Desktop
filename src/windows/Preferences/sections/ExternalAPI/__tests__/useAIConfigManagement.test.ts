import { AiAPIConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { AIProviderConfig } from '@services/externalAPI/interface';
import { act, renderHook, waitFor } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAIConfigManagement } from '../useAIConfigManagement';

describe('useAIConfigManagement', () => {
  const mockAIConfig: AiAPIConfig = {
    api: {
      provider: 'openai',
      model: 'gpt-4',
    },
    modelParameters: {
      temperature: 0.7,
      systemPrompt: 'You are a helpful assistant.',
      topP: 0.95,
    },
  };

  const mockProviders: AIProviderConfig[] = [
    {
      provider: 'openai',
      models: [{ name: 'gpt-4', features: ['language'] }],
      apiKey: 'sk-test',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Create BehaviorSubjects for Observable testing
    const configSubject = new BehaviorSubject(mockAIConfig);
    const providersSubject = new BehaviorSubject(mockProviders);

    // Mock externalAPI service methods
    Object.defineProperty(window.service.externalAPI, 'getAIConfig', {
      value: vi.fn().mockResolvedValue(mockAIConfig),
      writable: true,
    });

    Object.defineProperty(window.service.externalAPI, 'getAIProviders', {
      value: vi.fn().mockResolvedValue(mockProviders),
      writable: true,
    });

    Object.defineProperty(window.service.externalAPI, 'updateDefaultAIConfig', {
      value: vi.fn().mockResolvedValue(undefined),
      writable: true,
    });

    // Mock observables through window.observables instead of window.service
    Object.defineProperty(window.observables, 'externalAPI', {
      value: {
        defaultConfig$: configSubject,
        providers$: providersSubject,
      },
      writable: true,
    });

    // Mock native.log
    Object.defineProperty(window.service.native, 'log', {
      value: vi.fn(),
      writable: true,
    });
  });

  describe('Observable subscription', () => {
    it('should subscribe to config and providers observables on mount', async () => {
      const { result } = renderHook(() => useAIConfigManagement());

      // Wait for initial load
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Verify initial config and providers are loaded
      expect(result.current.config).toEqual(mockAIConfig);
      expect(result.current.providers).toEqual(mockProviders);
    });

    it('should update config when defaultConfig$ observable emits', async () => {
      const { result } = renderHook(() => useAIConfigManagement());

      // Wait for initial load
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Update the observable
      const updatedConfig: AiAPIConfig = {
        ...mockAIConfig,
        default: mockAIConfig.default
          ? {
            ...mockAIConfig.default,
            model: 'gpt-3.5-turbo',
          }
          : { provider: 'openai', model: 'gpt-3.5-turbo' },
      };

      act(() => {
        (window.observables.externalAPI.defaultConfig$).next(updatedConfig);
      });

      // Config should update from observable
      await waitFor(() => {
        expect(result.current.config?.default?.model).toBe('gpt-3.5-turbo');
      });
    });

    it('should update providers when providers$ observable emits', async () => {
      const { result } = renderHook(() => useAIConfigManagement());

      // Wait for initial load
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Update providers observable
      const updatedProviders: AIProviderConfig[] = [
        ...mockProviders,
        {
          provider: 'anthropic',
          models: [{ name: 'claude-3', features: ['language'] }],
          apiKey: 'sk-anthropic',
        },
      ];

      act(() => {
        (window.observables.externalAPI.providers$).next(updatedProviders);
      });

      // Providers should update from observable
      await waitFor(() => {
        expect(result.current.providers).toHaveLength(2);
        expect(result.current.providers[1].provider).toBe('anthropic');
      });
    });

    it('should unsubscribe from observables on unmount', async () => {
      const configSubject = window.observables.externalAPI.defaultConfig$;
      const unsubscribeSpy = vi.spyOn(configSubject, 'subscribe');

      const { unmount } = renderHook(() => useAIConfigManagement());

      // Wait for initial load
      await waitFor(() => {
        expect(unsubscribeSpy).toHaveBeenCalled();
      });

      const subscription = unsubscribeSpy.mock.results[0].value;
      const unsubscribeFn = vi.spyOn(subscription, 'unsubscribe');

      unmount();

      // Verify unsubscribe was called
      expect(unsubscribeFn).toHaveBeenCalled();
    });
  });

  describe('handleModelChange', () => {
    it('should update config when model changes', async () => {
      const { result } = renderHook(() => useAIConfigManagement());

      // Wait for initial load
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Change model
      await act(async () => {
        await result.current.handleModelChange('openai', 'gpt-3.5-turbo');
      });

      // Verify config was updated
      expect(result.current.config?.default?.model).toBe('gpt-3.5-turbo');
      expect(result.current.config?.default?.provider).toBe('openai');

      // Verify backend was called
      expect(window.service.externalAPI.updateDefaultAIConfig).toHaveBeenCalled();
    });
  });

  describe('initialization', () => {
    it('should load config on mount', async () => {
      const { result } = renderHook(() => useAIConfigManagement());

      // Should start loading
      expect(result.current.loading).toBe(true);

      // Wait for load to complete
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Verify config and providers are loaded
      expect(result.current.config).toEqual(mockAIConfig);
      expect(result.current.providers).toEqual(mockProviders);
      expect(window.service.externalAPI.getAIConfig).toHaveBeenCalled();
      expect(window.service.externalAPI.getAIProviders).toHaveBeenCalled();
    });

    it('should handle error during initialization gracefully', async () => {
      const mockLog = vi.fn();
      Object.defineProperty(window.service.native, 'log', {
        value: mockLog,
        writable: true,
      });

      // Reset and mock getAIConfig to throw error first time
      let callCount = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window.service.externalAPI.getAIConfig as any).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Failed to load');
        }
        // Return mock config from subscription
        return mockAIConfig;
      });

      const { result } = renderHook(() => useAIConfigManagement());

      // Wait for load to complete (even with error)
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Verify error was logged
      expect(mockLog).toHaveBeenCalledWith(
        'error',
        'Failed to load AI configuration',
        expect.any(Object),
      );

      // Config should still have default value from Observable
      // (not null, since we subscribe to defaultConfig$ and providers$)
      expect(result.current.config).toBeDefined();
    });
  });
});
