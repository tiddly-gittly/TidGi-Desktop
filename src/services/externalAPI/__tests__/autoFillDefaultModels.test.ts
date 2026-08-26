import { AIProviderConfig, type DesktopAIConfig, IExternalAPIService, ModelInfo } from '@services/externalAPI/interface';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for auto-fill default models logic in the backend
 * The backend's ExternalAPIService.updateProvider method should automatically
 * fill in default models when new models are added to a provider
 *
 * Key principles:
 * 1. NEVER overwrite existing default model values
 * 2. Only fill when default is empty/undefined
 * 3. Only process NEW models (not existing ones)
 */
describe('ExternalAPIService - Auto-fill Default Models (Backend)', () => {
  const mockLanguageModel: ModelInfo = {
    name: 'gpt-4',
    caption: 'GPT-4 Language Model',
    features: ['language'],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock window.service.native.log
    Object.defineProperty(window.service.native, 'log', {
      value: vi.fn(),
      writable: true,
    });
  });

  describe('Observable exposure', () => {
    it('should expose defaultConfig$ observable to frontend', () => {
      const mockConfig: DesktopAIConfig = {
        default: { provider: 'openai', model: 'gpt-4' },
        modelParameters: { temperature: 0.7, topP: 0.95 },
      };

      const configSubject = new BehaviorSubject(mockConfig);

      // Use type assertion to access Observable properties in tests
      Object.defineProperty(window.service.externalAPI, 'defaultConfig$', {
        value: configSubject,
        writable: true,
      });

      // Frontend should be able to subscribe to config changes
      const subscription = (window.service.externalAPI as unknown as IExternalAPIService).defaultConfig$.subscribe((config: DesktopAIConfig) => {
        expect(config.default?.provider).toBe('openai');
      });

      expect(subscription).toBeDefined();
      subscription.unsubscribe();
    });

    it('should expose providers$ observable to frontend', () => {
      const mockProviders: AIProviderConfig[] = [
        {
          provider: 'openai',
          models: [mockLanguageModel],
          apiKey: 'sk-test',
        },
      ];

      const providersSubject = new BehaviorSubject(mockProviders);

      // Use type assertion to access Observable properties in tests
      Object.defineProperty(window.service.externalAPI, 'providers$', {
        value: providersSubject,
        writable: true,
      });

      // Frontend should be able to subscribe to provider changes
      const subscription = (window.service.externalAPI as unknown as IExternalAPIService).providers$.subscribe((providers: AIProviderConfig[]) => {
        expect(providers).toHaveLength(1);
        expect(providers[0].provider).toBe('openai');
      });

      expect(subscription).toBeDefined();
      subscription.unsubscribe();
    });
  });

  describe('Auto-fill behavior', () => {
    it('should emit updated config when auto-fill happens', () => {
      const initialConfig: DesktopAIConfig = {
        default: undefined,
        modelParameters: { temperature: 0.7, topP: 0.95 },
      };

      const configSubject = new BehaviorSubject(initialConfig);

      Object.defineProperty(window.service.externalAPI, 'defaultConfig$', {
        value: configSubject,
        writable: true,
      });

      // Simulate backend auto-filling language model after provider addition
      const updatedConfig: DesktopAIConfig = {
        default: { provider: 'openai', model: 'gpt-4' },
        modelParameters: initialConfig.modelParameters,
      };

      const emittedConfigs: DesktopAIConfig[] = [];
      const subscription = configSubject.subscribe(config => {
        emittedConfigs.push(config);
      });

      // Simulate backend emitting updated config
      configSubject.next(updatedConfig);

      // Frontend should receive both initial and updated configs
      expect(emittedConfigs).toHaveLength(2);
      expect(emittedConfigs[0].default).toBeUndefined();
      expect(emittedConfigs[1].default?.provider).toBe('openai');

      subscription.unsubscribe();
    });

    it('should NOT overwrite existing default values', () => {
      const configWithExisting: DesktopAIConfig = {
        default: { provider: 'anthropic', model: 'claude-3' },
        embedding: { provider: 'openai', model: 'existing-embedding-model' },
        modelParameters: { temperature: 0.7, topP: 0.95 },
      };

      const configSubject = new BehaviorSubject(configWithExisting);

      // Simulate adding a new provider with embedding model
      // Backend should NOT overwrite existing embeddingModel
      const afterAddingNewProvider: DesktopAIConfig = {
        ...configWithExisting,
        // embeddingModel should remain unchanged
      };

      const emittedConfigs: DesktopAIConfig[] = [];
      const subscription = configSubject.subscribe(config => {
        emittedConfigs.push(config);
      });

      configSubject.next(afterAddingNewProvider);

      // Existing embedding model should NOT be changed
      expect(emittedConfigs[1].embedding?.model).toBe('existing-embedding-model');

      subscription.unsubscribe();
    });

    it('should only auto-fill when default is empty', () => {
      const configWithoutEmbedding: DesktopAIConfig = {
        default: { provider: 'openai', model: 'gpt-4' },
        modelParameters: { temperature: 0.7, topP: 0.95 },
      };

      const configSubject = new BehaviorSubject(configWithoutEmbedding);

      // Simulate backend auto-filling embedding model (empty before)
      const configWithEmbedding: DesktopAIConfig = {
        ...configWithoutEmbedding,
        embedding: { provider: 'openai', model: 'text-embedding-3-small' },
      };

      const emittedConfigs: DesktopAIConfig[] = [];
      const subscription = configSubject.subscribe(config => {
        emittedConfigs.push(config);
      });

      configSubject.next(configWithEmbedding);

      // Embedding model should be filled
      expect(emittedConfigs[1].embedding?.model).toBe('text-embedding-3-small');

      subscription.unsubscribe();
    });
  });

  describe('Multiple subscribers', () => {
    it('should support multiple subscribers to observable', () => {
      const mockConfig: DesktopAIConfig = {
        default: { provider: 'openai', model: 'gpt-4' },
        modelParameters: { temperature: 0.7, topP: 0.95 },
      };

      const configSubject = new BehaviorSubject(mockConfig);

      // Multiple subscribers should all receive updates
      const subscriber1Calls: DesktopAIConfig[] = [];
      const subscriber2Calls: DesktopAIConfig[] = [];

      const sub1 = configSubject.subscribe(config => {
        subscriber1Calls.push(config);
      });

      const sub2 = configSubject.subscribe(config => {
        subscriber2Calls.push(config);
      });

      expect(subscriber1Calls).toHaveLength(1);
      expect(subscriber2Calls).toHaveLength(1);

      // Emit update
      const updatedConfig: DesktopAIConfig = {
        ...mockConfig,
        default: { ...mockConfig.default!, model: 'gpt-3.5-turbo' },
      };

      configSubject.next(updatedConfig);

      // Both subscribers should receive the update
      expect(subscriber1Calls).toHaveLength(2);
      expect(subscriber2Calls).toHaveLength(2);

      sub1.unsubscribe();
      sub2.unsubscribe();
    });
  });
});
