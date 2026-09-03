import type { AgentFrameworkConfig } from 'memeloop';
import { mergeAgentToolsIntoFrameworkConfig } from 'memeloop/tools';
import React, { useCallback, useEffect, useRef, useState } from 'react';

interface useAgentFrameworkConfigManagementProps {
  agentDefId?: string;
  agentId?: string;
}

export type AgentFrameworkConfigOperation = 'load' | 'update' | 'clear';

export interface AgentFrameworkConfigFailure {
  operation: AgentFrameworkConfigOperation;
  error: Error;
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

interface UseAgentFrameworkConfigManagementResult {
  loading: boolean;
  config: AgentFrameworkConfig | undefined;
  /** The last failed operation. The UI maps the operation to a localized message. */
  error?: AgentFrameworkConfigFailure;
  clearError?: () => void;
  /** 立即更新本地 config（用于输入时保持 formData 与输入一致，避免光标跳动） */
  setConfig: React.Dispatch<React.SetStateAction<AgentFrameworkConfig | undefined>>;
  schema?: Record<string, unknown>;
  /** 仅持久化到后端。表单输入时应先 setConfig 再在防抖中调用此方法。 */
  persistConfig: (newConfig: AgentFrameworkConfig) => Promise<void>;
  /** 同时更新本地并持久化（用于保存按钮等单次提交场景） */
  handleConfigChange: (newConfig: AgentFrameworkConfig) => Promise<void>;
}

export const useAgentFrameworkConfigManagement = ({ agentDefId, agentId }: useAgentFrameworkConfigManagementProps = {}): UseAgentFrameworkConfigManagementResult => {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<AgentFrameworkConfig | undefined>(undefined);
  const [schema, setSchema] = useState<Record<string, unknown> | undefined>(undefined);
  const [error, setError] = useState<AgentFrameworkConfigFailure>();
  const persistedConfigReference = useRef<AgentFrameworkConfig | undefined>(undefined);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        setError(undefined);
        setConfig(undefined);
        persistedConfigReference.current = undefined;
        setSchema(undefined);
        let rawConfig: AgentFrameworkConfig | undefined;
        let agentDefinition: Awaited<ReturnType<typeof window.service.agentDefinition.getAgentDef>> | undefined;

        if (agentId) {
          const agentInstance = await window.service.agentInstance.getAgentMetadata(agentId);
          if (agentInstance?.agentDefId) {
            agentDefinition = await window.service.agentDefinition.getAgentDef(agentInstance.agentDefId);
          }
          rawConfig = agentInstance?.agentFrameworkConfig ?? agentDefinition?.agentFrameworkConfig;
        } else if (agentDefId) {
          agentDefinition = await window.service.agentDefinition.getAgentDef(agentDefId);
          rawConfig = agentDefinition?.agentFrameworkConfig;
        }

        // Built-in profiles use the Core loop's `loopId` rather than the
        // Desktop-only `agentFrameworkID`, and persisted definitions may lose
        // that non-storage field. A canonical prompt config is still enough
        // to select the built-in schema as a safe fallback.
        const definitionLoopId = agentDefinition !== undefined && 'loopId' in agentDefinition &&
            typeof agentDefinition.loopId === 'string'
          ? agentDefinition.loopId
          : undefined;
        const isAgentToolLoopConfig = (
          rawConfig !== undefined && ['prompts', 'plugins', 'response'].some(key => key in rawConfig)
        ) || (agentDefinition?.agentTools?.length ?? 0) > 0;
        const agentFrameworkID = agentDefinition?.agentFrameworkID ??
          definitionLoopId ??
          (isAgentToolLoopConfig ? 'agent-tool-loop' : undefined);

        if (agentFrameworkID) {
          try {
            const frameworkSchema = await window.service.agentInstance.getFrameworkConfigSchema(agentFrameworkID);
            setSchema(frameworkSchema);
          } catch (error) {
            const normalizedError = toError(error);
            setError({ operation: 'load', error: normalizedError });
            void window.service.native.log('error', 'Failed to load framework schema', {
              function: 'useAgentFrameworkConfigManagement.fetchConfig',
              error: normalizedError,
            });
          }
        }

        const finalConfig = rawConfig !== undefined || (agentDefinition?.agentTools?.length ?? 0) > 0
          ? mergeAgentToolsIntoFrameworkConfig(rawConfig, agentDefinition?.agentTools)
          : undefined;
        setConfig(finalConfig);
        persistedConfigReference.current = finalConfig;
        setLoading(false);
      } catch (error) {
        const normalizedError = toError(error);
        setConfig(undefined);
        persistedConfigReference.current = undefined;
        setError({ operation: 'load', error: normalizedError });
        void window.service.native.log('error', 'Failed to load framework configuration', {
          function: 'useAgentFrameworkConfigManagement.fetchConfig',
          error: normalizedError,
        });
        setLoading(false);
      }
    };

    void fetchConfig();
  }, [agentDefId, agentId]);

  const persistConfig = useCallback(async (newConfig: AgentFrameworkConfig) => {
    const previousConfig = persistedConfigReference.current;
    setError(undefined);
    try {
      if (agentId) {
        await window.service.agentInstance.updateAgent(agentId, {
          agentFrameworkConfig: newConfig,
        });
      } else if (agentDefId) {
        const agentDefinition = await window.service.agentDefinition.getAgentDef(agentDefId);
        if (agentDefinition) {
          await window.service.agentDefinition.updateAgentDef({
            ...agentDefinition,
            agentFrameworkConfig: newConfig,
          });
        } else {
          throw new Error(`Agent definition not found: ${agentDefId}`);
        }
      } else {
        throw new Error('An agent ID or definition ID is required to update framework configuration');
      }
      persistedConfigReference.current = newConfig;
    } catch (error) {
      const normalizedError = toError(error);
      setConfig(previousConfig);
      setError({ operation: 'update', error: normalizedError });
      void window.service.native.log('error', 'Failed to update framework configuration', {
        function: 'useAgentFrameworkConfigManagement.persistConfig',
        error: normalizedError,
      });
      throw normalizedError;
    }
  }, [agentId, agentDefId]);

  const handleConfigChange = useCallback(async (newConfig: AgentFrameworkConfig) => {
    setConfig(newConfig);
    await persistConfig(newConfig);
  }, [persistConfig]);

  const clearError = useCallback(() => {
    setError(undefined);
  }, []);

  return {
    loading,
    config,
    error,
    clearError,
    setConfig,
    schema,
    persistConfig,
    handleConfigChange,
  };
};
