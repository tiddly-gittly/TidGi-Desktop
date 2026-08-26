import { AIProviderConfig, type DesktopAIConfig } from '@services/externalAPI/interface';
import { cloneDeep } from 'lodash';
import type { AgentModelConfig } from 'memeloop';
import { useCallback, useEffect, useState } from 'react';

interface UseAIConfigManagementProps {
  agentDefId?: string;
  agentId?: string;
}

interface UseAIConfigManagementResult {
  loading: boolean;
  config: DesktopAIConfig | null;
  providers: AIProviderConfig[];
  setProviders: React.Dispatch<React.SetStateAction<AIProviderConfig[]>>;
  handleModelChange: (provider: string, model: string) => Promise<void>;
  handleEmbeddingModelChange: (provider: string, model: string) => Promise<void>;
  handleSpeechModelChange: (provider: string, model: string) => Promise<void>;
  handleImageGenerationModelChange: (provider: string, model: string) => Promise<void>;
  handleTranscriptionsModelChange: (provider: string, model: string) => Promise<void>;
  handleFreeModelChange: (provider: string, model: string) => Promise<void>;
  handleConfigChange: (newConfig: DesktopAIConfig) => Promise<void>;
}

export const useAIConfigManagement = ({ agentDefId, agentId }: UseAIConfigManagementProps = {}): UseAIConfigManagementResult => {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<DesktopAIConfig | null>(null);
  const [providers, setProviders] = useState<AIProviderConfig[]>([]);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        let agentModelConfig: AgentModelConfig | undefined;

        // Three-tier configuration hierarchy: global < definition < instance
        // Load global config as base
        const globalConfig = await window.service.externalAPI.getAIConfig();

        if (agentId) {
          // Get instance config first
          const agentInstance = await window.service.agentInstance.getAgentMetadata(agentId);
          if (agentInstance?.modelConfig) {
            agentModelConfig = agentInstance.modelConfig;
          } else if (agentInstance?.agentDefId) {
            // Auto-resolve agentDefId from agentId and get definition config
            const agentDefinition = await window.service.agentDefinition.getAgentDef(agentInstance.agentDefId);
            agentModelConfig = agentDefinition?.modelConfig;
          }
        } else if (agentDefId) {
          // Get definition config
          const agentDefinition = await window.service.agentDefinition.getAgentDef(agentDefId);
          agentModelConfig = agentDefinition?.modelConfig;
        }

        setConfig(toDesktopConfig(globalConfig, agentModelConfig));

        const providersData = await window.service.externalAPI.getAIProviders();
        setProviders(providersData);

        setLoading(false);
      } catch (error) {
        void window.service.native.log('error', 'Failed to load AI configuration', { function: 'useAIConfigManagement.fetchConfig', error });
        setLoading(false);
      }
    };

    void fetchConfig();

    // Subscribe to config changes from backend
    const configSubscription = window.observables.externalAPI.defaultConfig$.subscribe(updatedConfig => {
      // Only update if we're using global config (not agent-specific config)
      if (!agentId && !agentDefId) {
        setConfig(updatedConfig);
      }
    });

    const providersSubscription = window.observables.externalAPI.providers$.subscribe(updatedProviders => {
      setProviders(updatedProviders);
    });

    return () => {
      configSubscription.unsubscribe();
      providersSubscription.unsubscribe();
    };
  }, [agentDefId, agentId]);

  const updateConfig = useCallback(async (updatedConfig: DesktopAIConfig) => {
    if (agentId) {
      await window.service.agentInstance.updateAgent(agentId, { modelConfig: toAgentModelConfig(updatedConfig) });
    } else if (agentDefId) {
      await window.service.agentDefinition.updateAgentDef({
        id: agentDefId,
        modelConfig: toAgentModelConfig(updatedConfig),
      });
    } else {
      // Update global config
      await window.service.externalAPI.updateDefaultAIConfig(updatedConfig);
    }
  }, [agentId, agentDefId]);

  const handleModelChange = useCallback(async (provider: string, model: string) => {
    if (!config) return;

    try {
      const updatedConfig = cloneDeep(config);
      updatedConfig.default = { provider, model };

      setConfig(updatedConfig);
      await updateConfig(updatedConfig);
    } catch (error) {
      void window.service.native.log('error', 'Failed to update model configuration', { function: 'useAIConfigManagement.handleModelChange', error });
    }
  }, [config, updateConfig]);

  const handleEmbeddingModelChange = useCallback(async (provider: string, model: string) => {
    if (!config) return;

    try {
      const updatedConfig = cloneDeep(config);
      updatedConfig.embedding = { provider, model };

      setConfig(updatedConfig);
      await updateConfig(updatedConfig);
    } catch (error) {
      void window.service.native.log('error', 'Failed to update embedding model configuration', {
        function: 'useAIConfigManagement.handleEmbeddingModelChange',
        error,
      });
    }
  }, [config, updateConfig]);

  const handleSpeechModelChange = useCallback(async (provider: string, model: string) => {
    if (!config) return;

    try {
      const updatedConfig = cloneDeep(config);
      updatedConfig.speech = { provider, model };

      setConfig(updatedConfig);
      await updateConfig(updatedConfig);
    } catch (error) {
      void window.service.native.log('error', 'Failed to update speech model configuration', {
        function: 'useAIConfigManagement.handleSpeechModelChange',
        error,
      });
    }
  }, [config, updateConfig]);

  const handleImageGenerationModelChange = useCallback(async (provider: string, model: string) => {
    if (!config) return;

    try {
      const updatedConfig = cloneDeep(config);
      updatedConfig.imageGeneration = { provider, model };

      setConfig(updatedConfig);
      await updateConfig(updatedConfig);
    } catch (error) {
      void window.service.native.log('error', 'Failed to update image generation model configuration', {
        function: 'useAIConfigManagement.handleImageGenerationModelChange',
        error,
      });
    }
  }, [config, updateConfig]);

  const handleTranscriptionsModelChange = useCallback(async (provider: string, model: string) => {
    if (!config) return;

    try {
      const updatedConfig = cloneDeep(config);
      updatedConfig.transcriptions = { provider, model };

      setConfig(updatedConfig);
      await updateConfig(updatedConfig);
    } catch (error) {
      void window.service.native.log('error', 'Failed to update transcriptions model configuration', {
        function: 'useAIConfigManagement.handleTranscriptionsModelChange',
        error,
      });
    }
  }, [config, updateConfig]);

  const handleFreeModelChange = useCallback(async (provider: string, model: string) => {
    if (!config) return;

    try {
      const updatedConfig = cloneDeep(config);
      updatedConfig.free = { provider, model };

      setConfig(updatedConfig);
      await updateConfig(updatedConfig);
    } catch (error) {
      void window.service.native.log('error', 'Failed to update free model configuration', {
        function: 'useAIConfigManagement.handleFreeModelChange',
        error,
      });
    }
  }, [config, updateConfig]);

  const handleConfigChange = useCallback(async (newConfig: DesktopAIConfig) => {
    try {
      setConfig(newConfig);
      await updateConfig(newConfig);
    } catch (error) {
      void window.service.native.log('error', 'Failed to update configuration', { function: 'useAIConfigManagement.handleConfigChange', error });
    }
  }, [updateConfig]);

  return {
    loading,
    config,
    providers,
    setProviders,
    handleModelChange,
    handleEmbeddingModelChange,
    handleSpeechModelChange,
    handleImageGenerationModelChange,
    handleTranscriptionsModelChange,
    handleFreeModelChange,
    handleConfigChange,
  };
};

function toDesktopConfig(
  globalConfig: DesktopAIConfig,
  modelConfig: AgentModelConfig | undefined,
): DesktopAIConfig {
  const result = cloneDeep(globalConfig);
  if (!modelConfig) return result;
  result.default = { provider: modelConfig.providerId, model: modelConfig.modelId };
  result.modelParameters = {
    ...result.modelParameters,
    ...modelConfig.parameters,
    ...(modelConfig.parameters?.maxOutputTokens === undefined
      ? {}
      : { maxTokens: modelConfig.parameters.maxOutputTokens }),
  };
  return result;
}

function toAgentModelConfig(config: DesktopAIConfig): AgentModelConfig {
  const selected = config.default;
  if (!selected?.provider || !selected.model) throw new Error('Agent model selection is required');
  const maxOutputTokens = config.modelParameters.maxOutputTokens ?? config.modelParameters.maxTokens;
  return {
    providerId: selected.provider,
    modelId: selected.model,
    parameters: {
      ...(config.modelParameters.temperature === undefined
        ? {}
        : { temperature: config.modelParameters.temperature }),
      ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
      ...(config.modelParameters.topP === undefined ? {} : { topP: config.modelParameters.topP }),
    },
  };
}
