import { AiAPIConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { AIProviderConfig } from '@services/externalAPI/interface';
import { cloneDeep } from 'lodash';
import { useCallback, useEffect, useState } from 'react';

interface UseAIConfigManagementProps {
  agentDefId?: string;
  agentId?: string;
}

interface UseAIConfigManagementResult {
  loading: boolean;
  config: AiAPIConfig | null;
  providers: AIProviderConfig[];
  setProviders: React.Dispatch<React.SetStateAction<AIProviderConfig[]>>;
  handleModelChange: (provider: string, model: string) => Promise<void>;
  handleEmbeddingModelChange: (provider: string, model: string) => Promise<void>;
  handleSpeechModelChange: (provider: string, model: string) => Promise<void>;
  handleImageGenerationModelChange: (provider: string, model: string) => Promise<void>;
  handleTranscriptionsModelChange: (provider: string, model: string) => Promise<void>;
  handleConfigChange: (newConfig: AiAPIConfig) => Promise<void>;
}

export const useAIConfigManagement = ({ agentDefId, agentId }: UseAIConfigManagementProps = {}): UseAIConfigManagementResult => {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<AiAPIConfig | null>(null);
  const [providers, setProviders] = useState<AIProviderConfig[]>([]);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        let finalConfig: AiAPIConfig | null = null;

        // Three-tier configuration hierarchy: global < definition < instance
        // Load global config as base
        const globalConfig = await window.service.externalAPI.getAIConfig();

        if (agentId) {
          // Get instance config first
          const agentInstance = await window.service.agentInstance.getAgent(agentId);
          if (agentInstance?.aiApiConfig && Object.keys(agentInstance.aiApiConfig).length > 0) {
            finalConfig = agentInstance.aiApiConfig as AiAPIConfig;
          } else if (agentInstance?.agentDefId) {
            // Auto-resolve agentDefId from agentId and get definition config
            const agentDefinition = await window.service.agentDefinition.getAgentDef(agentInstance.agentDefId);
            if (agentDefinition?.aiApiConfig && Object.keys(agentDefinition.aiApiConfig).length > 0) {
              finalConfig = agentDefinition.aiApiConfig as AiAPIConfig;
            }
          }
        } else if (agentDefId) {
          // Get definition config
          const agentDefinition = await window.service.agentDefinition.getAgentDef(agentDefId);
          if (agentDefinition?.aiApiConfig && Object.keys(agentDefinition.aiApiConfig).length > 0) {
            finalConfig = agentDefinition.aiApiConfig as AiAPIConfig;
          }
        }

        // Fallback to global config if no specific config found
        if (!finalConfig) {
          finalConfig = globalConfig;
        }

        setConfig(finalConfig);

        const providersData = await window.service.externalAPI.getAIProviders();
        setProviders(providersData);

        setLoading(false);
      } catch (error) {
        void window.service.native.log('error', 'Failed to load AI configuration', { function: 'useAIConfigManagement.fetchConfig', error: String(error) });
        setLoading(false);
      }
    };

    void fetchConfig();
  }, [agentDefId, agentId]);

  const updateConfig = useCallback(async (updatedConfig: AiAPIConfig) => {
    if (agentId) {
      // Direct update for instance config
      await window.service.agentInstance.updateAgent(agentId, { aiApiConfig: updatedConfig });
    } else if (agentDefId) {
      // Direct update for definition config
      await window.service.agentDefinition.updateAgentDef({
        id: agentDefId,
        aiApiConfig: updatedConfig,
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
      if (typeof updatedConfig.api === 'undefined') {
        updatedConfig.api = { provider, model };
      } else {
        updatedConfig.api.provider = provider;
        updatedConfig.api.model = model;
      }

      setConfig(updatedConfig);
      await updateConfig(updatedConfig);
    } catch (error) {
      void window.service.native.log('error', 'Failed to update model configuration', { function: 'useAIConfigManagement.handleModelChange', error: String(error) });
    }
  }, [config, updateConfig]);

  const handleEmbeddingModelChange = useCallback(async (provider: string, model: string) => {
    if (!config) return;

    try {
      const updatedConfig = cloneDeep(config);
      if (typeof updatedConfig.api === 'undefined') {
        updatedConfig.api = { provider, model, embeddingModel: model };
      } else {
        updatedConfig.api.embeddingModel = model;
      }

      setConfig(updatedConfig);
      await updateConfig(updatedConfig);
    } catch (error) {
      void window.service.native.log('error', 'Failed to update embedding model configuration', {
        function: 'useAIConfigManagement.handleEmbeddingModelChange',
        error: String(error),
      });
    }
  }, [config, updateConfig]);

  const handleSpeechModelChange = useCallback(async (provider: string, model: string) => {
    if (!config) return;

    try {
      const updatedConfig = cloneDeep(config);
      if (typeof updatedConfig.api === 'undefined') {
        updatedConfig.api = { provider, model, speechModel: model };
      } else {
        updatedConfig.api.speechModel = model;
      }

      setConfig(updatedConfig);
      await updateConfig(updatedConfig);
    } catch (error) {
      void window.service.native.log('error', 'Failed to update speech model configuration', {
        function: 'useAIConfigManagement.handleSpeechModelChange',
        error: String(error),
      });
    }
  }, [config, updateConfig]);

  const handleImageGenerationModelChange = useCallback(async (provider: string, model: string) => {
    if (!config) return;

    try {
      const updatedConfig = cloneDeep(config);
      if (typeof updatedConfig.api === 'undefined') {
        updatedConfig.api = { provider, model, imageGenerationModel: model };
      } else {
        updatedConfig.api.imageGenerationModel = model;
      }

      setConfig(updatedConfig);
      await updateConfig(updatedConfig);
    } catch (error) {
      void window.service.native.log('error', 'Failed to update image generation model configuration', {
        function: 'useAIConfigManagement.handleImageGenerationModelChange',
        error: String(error),
      });
    }
  }, [config, updateConfig]);

  const handleTranscriptionsModelChange = useCallback(async (provider: string, model: string) => {
    if (!config) return;

    try {
      const updatedConfig = cloneDeep(config);
      if (typeof updatedConfig.api === 'undefined') {
        updatedConfig.api = { provider, model, transcriptionsModel: model };
      } else {
        updatedConfig.api.transcriptionsModel = model;
      }

      setConfig(updatedConfig);
      await updateConfig(updatedConfig);
    } catch (error) {
      void window.service.native.log('error', 'Failed to update transcriptions model configuration', {
        function: 'useAIConfigManagement.handleTranscriptionsModelChange',
        error: String(error),
      });
    }
  }, [config, updateConfig]);

  const handleConfigChange = useCallback(async (newConfig: AiAPIConfig) => {
    try {
      setConfig(newConfig);
      await updateConfig(newConfig);
    } catch (error) {
      void window.service.native.log('error', 'Failed to update configuration', { function: 'useAIConfigManagement.handleConfigChange', error: String(error) });
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
    handleConfigChange,
  };
};
