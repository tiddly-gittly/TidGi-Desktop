import { cloneDeep } from 'lodash';
import type { AgentModelConfig, ModelAssignments, ProviderAccountConfig } from 'memeloop';
import { useCallback, useEffect, useState } from 'react';

interface UseAIConfigManagementProps {
  agentDefId?: string;
  agentId?: string;
}

interface UseAIConfigManagementResult {
  loading: boolean;
  config: ModelAssignments | null;
  accounts: ProviderAccountConfig[];
  setAccounts: React.Dispatch<React.SetStateAction<ProviderAccountConfig[]>>;
  handleModelChange: (selection: AgentModelConfig) => Promise<void>;
  handleEmbeddingModelChange: (selection: AgentModelConfig) => Promise<void>;
  handleSpeechModelChange: (selection: AgentModelConfig) => Promise<void>;
  handleImageGenerationModelChange: (selection: AgentModelConfig) => Promise<void>;
  handleTranscriptionsModelChange: (selection: AgentModelConfig) => Promise<void>;
  handleFreeModelChange: (selection: AgentModelConfig) => Promise<void>;
  handleConfigChange: (newConfig: ModelAssignments) => Promise<void>;
}

export const useAIConfigManagement = ({ agentDefId, agentId }: UseAIConfigManagementProps = {}): UseAIConfigManagementResult => {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<ModelAssignments | null>(null);
  const [accounts, setAccounts] = useState<ProviderAccountConfig[]>([]);

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

        setConfig(agentModelConfig === undefined ? globalConfig : { ...globalConfig, default: agentModelConfig });

        const providerAccounts = await window.service.externalAPI.getProviderAccounts();
        setAccounts(providerAccounts);

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

    const providerAccountsSubscription = window.observables.externalAPI.providerAccounts$.subscribe(updatedAccounts => {
      setAccounts(updatedAccounts);
    });

    return () => {
      configSubscription.unsubscribe();
      providerAccountsSubscription.unsubscribe();
    };
  }, [agentDefId, agentId]);

  const updateConfig = useCallback(async (updatedConfig: ModelAssignments) => {
    if (agentId) {
      if (!updatedConfig.default) throw new Error('Agent model selection is required');
      await window.service.agentInstance.updateAgent(agentId, { modelConfig: updatedConfig.default });
    } else if (agentDefId) {
      if (!updatedConfig.default) throw new Error('Agent model selection is required');
      await window.service.agentDefinition.updateAgentDef({
        id: agentDefId,
        modelConfig: updatedConfig.default,
      });
    } else {
      // Update global config
      await window.service.externalAPI.updateDefaultAIConfig(updatedConfig);
    }
  }, [agentId, agentDefId]);

  const updateSelection = useCallback(async (
    key: keyof ModelAssignments,
    selection: AgentModelConfig,
  ) => {
    if (!config) return;
    try {
      const updatedConfig = cloneDeep(config);
      updatedConfig[key] = selection;
      setConfig(updatedConfig);
      await updateConfig(updatedConfig);
    } catch (error) {
      void window.service.native.log('error', 'Failed to update model assignment', {
        function: 'useAIConfigManagement.updateSelection',
        key,
        error,
      });
    }
  }, [config, updateConfig]);

  const handleModelChange = useCallback(async (selection: AgentModelConfig) => {
    await updateSelection('default', {
      ...selection,
      ...(config?.default?.parameters === undefined
        ? {}
        : { parameters: config.default.parameters }),
    });
  }, [config?.default?.parameters, updateSelection]);
  const handleEmbeddingModelChange = useCallback(
    (selection: AgentModelConfig) => updateSelection('embedding', selection),
    [updateSelection],
  );
  const handleSpeechModelChange = useCallback(
    (selection: AgentModelConfig) => updateSelection('speech', selection),
    [updateSelection],
  );
  const handleImageGenerationModelChange = useCallback(
    (selection: AgentModelConfig) => updateSelection('imageGeneration', selection),
    [updateSelection],
  );
  const handleTranscriptionsModelChange = useCallback(
    (selection: AgentModelConfig) => updateSelection('transcriptions', selection),
    [updateSelection],
  );
  const handleFreeModelChange = useCallback(
    (selection: AgentModelConfig) => updateSelection('free', selection),
    [updateSelection],
  );

  const handleConfigChange = useCallback(async (newConfig: ModelAssignments) => {
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
    accounts,
    setAccounts,
    handleModelChange,
    handleEmbeddingModelChange,
    handleSpeechModelChange,
    handleImageGenerationModelChange,
    handleTranscriptionsModelChange,
    handleFreeModelChange,
    handleConfigChange,
  };
};
