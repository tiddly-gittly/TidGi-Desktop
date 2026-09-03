import type { AgentModelConfig, ModelAssignments, ProviderAccountConfig } from 'memeloop';
import { useCallback, useEffect, useState } from 'react';

interface UseAIConfigManagementProps {
  agentDefId?: string;
  agentId?: string;
}

export type AIConfigOperation = 'load' | 'update' | 'clear';

export interface AIConfigFailure {
  operation: AIConfigOperation;
  error: Error;
}

interface UseAIConfigManagementResult {
  loading: boolean;
  config: ModelAssignments | null;
  /** The last failed operation. The UI maps the operation to a localized message. */
  error?: AIConfigFailure;
  clearError?: () => void;
  accounts: ProviderAccountConfig[];
  setAccounts: React.Dispatch<React.SetStateAction<ProviderAccountConfig[]>>;
  handleModelChange: (selection: AgentModelConfig) => Promise<void>;
  handleEmbeddingModelChange: (selection: AgentModelConfig) => Promise<void>;
  handleSpeechModelChange: (selection: AgentModelConfig) => Promise<void>;
  handleImageGenerationModelChange: (selection: AgentModelConfig) => Promise<void>;
  handleTranscriptionsModelChange: (selection: AgentModelConfig) => Promise<void>;
  handleFreeModelChange: (selection: AgentModelConfig) => Promise<void>;
  handleConfigChange: (newConfig: ModelAssignments) => Promise<void>;
  handleFieldClear: (key: keyof ModelAssignments) => Promise<void>;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export const useAIConfigManagement = ({ agentDefId, agentId }: UseAIConfigManagementProps = {}): UseAIConfigManagementResult => {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<ModelAssignments | null>(null);
  const [accounts, setAccounts] = useState<ProviderAccountConfig[]>([]);
  const [error, setError] = useState<AIConfigFailure>();

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        setError(undefined);
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
        const normalizedError = toError(error);
        setConfig(null);
        setError({ operation: 'load', error: normalizedError });
        void window.service.native.log('error', 'Failed to load AI configuration', {
          function: 'useAIConfigManagement.fetchConfig',
          error: normalizedError,
        });
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
    const previousConfig = config;
    const updatedConfig: ModelAssignments = { ...config, [key]: selection };
    setConfig(updatedConfig);
    setError(undefined);
    try {
      await updateConfig(updatedConfig);
    } catch (error) {
      const normalizedError = toError(error);
      setConfig(previousConfig);
      setError({ operation: 'update', error: normalizedError });
      void window.service.native.log('error', 'Failed to update model assignment', {
        function: 'useAIConfigManagement.updateSelection',
        key,
        error: normalizedError,
      });
      throw normalizedError;
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
    const previousConfig = config;
    setConfig(newConfig);
    setError(undefined);
    try {
      await updateConfig(newConfig);
    } catch (error) {
      const normalizedError = toError(error);
      if (previousConfig !== undefined) setConfig(previousConfig);
      setError({ operation: 'update', error: normalizedError });
      void window.service.native.log('error', 'Failed to update configuration', {
        function: 'useAIConfigManagement.handleConfigChange',
        error: normalizedError,
      });
      throw normalizedError;
    }
  }, [config, updateConfig]);

  const handleFieldClear = useCallback(async (key: keyof ModelAssignments) => {
    if (!config) return;
    const previousConfig = config;
    const updatedConfig = { ...config };
    delete updatedConfig[key];
    setError(undefined);
    try {
      // The dedicated global delete API intentionally bypasses automatic
      // model auto-fill. Updating the whole assignment object here would
      // immediately repopulate a field the user explicitly cleared.
      if (!agentId && !agentDefId) {
        await window.service.externalAPI.deleteFieldFromDefaultAIConfig(key);
      } else {
        await updateConfig(updatedConfig);
      }
      setConfig(updatedConfig);
    } catch (error) {
      const normalizedError = toError(error);
      setConfig(previousConfig);
      setError({ operation: 'clear', error: normalizedError });
      void window.service.native.log('error', 'Failed to clear model assignment', {
        function: 'useAIConfigManagement.handleFieldClear',
        key,
        error: normalizedError,
      });
      throw normalizedError;
    }
  }, [agentDefId, agentId, config, updateConfig]);

  const clearError = useCallback(() => {
    setError(undefined);
  }, []);

  return {
    loading,
    config,
    error,
    clearError,
    accounts,
    setAccounts,
    handleModelChange,
    handleEmbeddingModelChange,
    handleSpeechModelChange,
    handleImageGenerationModelChange,
    handleTranscriptionsModelChange,
    handleFreeModelChange,
    handleConfigChange,
    handleFieldClear,
  };
};
