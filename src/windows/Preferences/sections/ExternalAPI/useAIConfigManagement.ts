import type { AgentModelConfig, ModelAssignments, ProviderAccountConfig } from 'memeloop';
import { useCallback, useEffect, useState } from 'react';

interface UseAIConfigManagementProps {
  agentDefId?: string;
  agentId?: string;
}

type ScopedAIConfigManagementProps =
  | { agentId: string; agentDefId?: string }
  | { agentDefId: string; agentId?: string };

export type AIConfigOperation = 'load' | 'update' | 'clear';

export interface AIConfigFailure {
  operation: AIConfigOperation;
  error: Error;
}

interface AIConfigManagementBase {
  loading: boolean;
  /** The last failed operation. The UI maps the operation to a localized message. */
  error?: AIConfigFailure;
  clearError?: () => void;
  accounts: ProviderAccountConfig[];
  setAccounts: React.Dispatch<React.SetStateAction<ProviderAccountConfig[]>>;
}

interface GlobalAIConfigManagementResult extends AIConfigManagementBase {
  config: ModelAssignments | null;
  handleModelChange: (selection: AgentModelConfig) => Promise<void>;
  handleEmbeddingModelChange: (selection: AgentModelConfig) => Promise<void>;
  handleSpeechModelChange: (selection: AgentModelConfig) => Promise<void>;
  handleImageGenerationModelChange: (selection: AgentModelConfig) => Promise<void>;
  handleTranscriptionsModelChange: (selection: AgentModelConfig) => Promise<void>;
  handleFreeModelChange: (selection: AgentModelConfig) => Promise<void>;
  handleConfigChange: (newConfig: ModelAssignments) => Promise<void>;
  handleFieldClear: (key: keyof ModelAssignments) => Promise<void>;
}

/** The renderer API for a definition or instance model override. */
interface ScopedAIConfigManagementResult extends AIConfigManagementBase {
  config: AgentModelConfig | null;
  handleModelChange: (selection: AgentModelConfig) => Promise<void>;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function useAIConfigManagement(): GlobalAIConfigManagementResult;
export function useAIConfigManagement(props: ScopedAIConfigManagementProps): ScopedAIConfigManagementResult;
export function useAIConfigManagement(props: UseAIConfigManagementProps): GlobalAIConfigManagementResult | ScopedAIConfigManagementResult;
export function useAIConfigManagement({ agentDefId, agentId }: UseAIConfigManagementProps = {}): GlobalAIConfigManagementResult | ScopedAIConfigManagementResult {
  const isScoped = agentId !== undefined || agentDefId !== undefined;
  const [loading, setLoading] = useState(true);
  const [globalConfig, setGlobalConfig] = useState<ModelAssignments | null>(null);
  const [scopedConfig, setScopedConfig] = useState<AgentModelConfig | null>(null);
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

        // Definitions and instances persist only one AgentModelConfig. Do not
        // merge auxiliary global assignments into this scoped view: doing so
        // makes the UI look editable while updates can only save `default`.
        if (isScoped) {
          setScopedConfig(agentModelConfig ?? globalConfig.default ?? null);
        } else {
          setGlobalConfig(globalConfig);
        }

        const providerAccounts = await window.service.externalAPI.getProviderAccounts();
        setAccounts(providerAccounts);

        setLoading(false);
      } catch (error) {
        const normalizedError = toError(error);
        setGlobalConfig(null);
        setScopedConfig(null);
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
        setGlobalConfig(updatedConfig);
      }
    });

    const providerAccountsSubscription = window.observables.externalAPI.providerAccounts$.subscribe(updatedAccounts => {
      setAccounts(updatedAccounts);
    });

    return () => {
      configSubscription.unsubscribe();
      providerAccountsSubscription.unsubscribe();
    };
  }, [agentDefId, agentId, isScoped]);

  const updateScopedConfig = useCallback(async (updatedConfig: AgentModelConfig) => {
    if (agentId) {
      await window.service.agentInstance.updateAgent(agentId, { modelConfig: updatedConfig });
    } else if (agentDefId) {
      await window.service.agentDefinition.updateAgentDef({
        id: agentDefId,
        modelConfig: updatedConfig,
      });
    }
  }, [agentId, agentDefId]);

  const updateGlobalSelection = useCallback(async (
    key: keyof ModelAssignments,
    selection: AgentModelConfig,
  ) => {
    if (!globalConfig) return;
    const previousConfig = globalConfig;
    const updatedConfig: ModelAssignments = { ...globalConfig, [key]: selection };
    setGlobalConfig(updatedConfig);
    setError(undefined);
    try {
      await window.service.externalAPI.updateDefaultAIConfig(updatedConfig);
    } catch (error) {
      const normalizedError = toError(error);
      setGlobalConfig(previousConfig);
      setError({ operation: 'update', error: normalizedError });
      void window.service.native.log('error', 'Failed to update model assignment', {
        function: 'useAIConfigManagement.updateSelection',
        key,
        error: normalizedError,
      });
      throw normalizedError;
    }
  }, [globalConfig]);

  const handleGlobalModelChange = useCallback(async (selection: AgentModelConfig) => {
    await updateGlobalSelection('default', {
      ...selection,
      ...(globalConfig?.default?.parameters === undefined
        ? {}
        : { parameters: globalConfig.default.parameters }),
    });
  }, [globalConfig?.default?.parameters, updateGlobalSelection]);
  const handleScopedModelChange = useCallback(async (selection: AgentModelConfig) => {
    const previousConfig = scopedConfig;
    const updatedConfig: AgentModelConfig = {
      ...selection,
      ...(scopedConfig?.parameters === undefined ? {} : { parameters: scopedConfig.parameters }),
    };
    setScopedConfig(updatedConfig);
    setError(undefined);
    try {
      await updateScopedConfig(updatedConfig);
    } catch (error) {
      const normalizedError = toError(error);
      setScopedConfig(previousConfig);
      setError({ operation: 'update', error: normalizedError });
      void window.service.native.log('error', 'Failed to update model assignment', {
        function: 'useAIConfigManagement.handleScopedModelChange',
        error: normalizedError,
      });
      throw normalizedError;
    }
  }, [scopedConfig, updateScopedConfig]);
  const handleEmbeddingModelChange = useCallback(
    (selection: AgentModelConfig) => updateGlobalSelection('embedding', selection),
    [updateGlobalSelection],
  );
  const handleSpeechModelChange = useCallback(
    (selection: AgentModelConfig) => updateGlobalSelection('speech', selection),
    [updateGlobalSelection],
  );
  const handleImageGenerationModelChange = useCallback(
    (selection: AgentModelConfig) => updateGlobalSelection('imageGeneration', selection),
    [updateGlobalSelection],
  );
  const handleTranscriptionsModelChange = useCallback(
    (selection: AgentModelConfig) => updateGlobalSelection('transcriptions', selection),
    [updateGlobalSelection],
  );
  const handleFreeModelChange = useCallback(
    (selection: AgentModelConfig) => updateGlobalSelection('free', selection),
    [updateGlobalSelection],
  );

  const handleConfigChange = useCallback(async (newConfig: ModelAssignments) => {
    const previousConfig = globalConfig;
    setGlobalConfig(newConfig);
    setError(undefined);
    try {
      await window.service.externalAPI.updateDefaultAIConfig(newConfig);
    } catch (error) {
      const normalizedError = toError(error);
      if (previousConfig !== undefined) setGlobalConfig(previousConfig);
      setError({ operation: 'update', error: normalizedError });
      void window.service.native.log('error', 'Failed to update configuration', {
        function: 'useAIConfigManagement.handleConfigChange',
        error: normalizedError,
      });
      throw normalizedError;
    }
  }, [globalConfig]);

  const handleFieldClear = useCallback(async (key: keyof ModelAssignments) => {
    if (!globalConfig) return;
    const previousConfig = globalConfig;
    const updatedConfig = { ...globalConfig };
    delete updatedConfig[key];
    setError(undefined);
    try {
      await window.service.externalAPI.deleteFieldFromDefaultAIConfig(key);
      setGlobalConfig(updatedConfig);
    } catch (error) {
      const normalizedError = toError(error);
      setGlobalConfig(previousConfig);
      setError({ operation: 'clear', error: normalizedError });
      void window.service.native.log('error', 'Failed to clear model assignment', {
        function: 'useAIConfigManagement.handleFieldClear',
        key,
        error: normalizedError,
      });
      throw normalizedError;
    }
  }, [globalConfig]);

  const clearError = useCallback(() => {
    setError(undefined);
  }, []);

  const baseResult: AIConfigManagementBase = {
    loading,
    error,
    clearError,
    accounts,
    setAccounts,
  };

  if (isScoped) {
    return {
      ...baseResult,
      config: scopedConfig,
      handleModelChange: handleScopedModelChange,
    };
  }

  return {
    ...baseResult,
    config: globalConfig,
    handleModelChange: handleGlobalModelChange,
    handleEmbeddingModelChange,
    handleSpeechModelChange,
    handleImageGenerationModelChange,
    handleTranscriptionsModelChange,
    handleFreeModelChange,
    handleConfigChange,
    handleFieldClear,
  };
}
