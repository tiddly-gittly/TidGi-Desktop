import { AgentFrameworkConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import React, { useCallback, useEffect, useState } from 'react';

interface useAgentFrameworkConfigManagementProps {
  agentDefId?: string;
  agentId?: string;
}

interface UseAgentFrameworkConfigManagementResult {
  loading: boolean;
  config: AgentFrameworkConfig | undefined;
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

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        let finalConfig: AgentFrameworkConfig | undefined;
        let agentFrameworkID: string | undefined;

        if (agentId) {
          const agentInstance = await window.service.agentInstance.getAgent(agentId);
          let agentDefinition: Awaited<ReturnType<typeof window.service.agentDefinition.getAgentDef>> | undefined;
          if (agentInstance?.agentDefId) {
            agentDefinition = await window.service.agentDefinition.getAgentDef(agentInstance.agentDefId);
          }
          // Use instance config if available, otherwise fallback to definition config
          if (agentInstance?.agentFrameworkConfig && Object.keys(agentInstance.agentFrameworkConfig).length > 0) {
            finalConfig = agentInstance.agentFrameworkConfig as AgentFrameworkConfig;
          } else if (agentDefinition?.agentFrameworkConfig) {
            finalConfig = agentDefinition.agentFrameworkConfig as AgentFrameworkConfig;
          }
          // Use agentFrameworkID from instance, fallback to definition
          agentFrameworkID = agentInstance?.agentFrameworkID || agentDefinition?.agentFrameworkID;
        } else if (agentDefId) {
          const agentDefinition = await window.service.agentDefinition.getAgentDef(agentDefId);
          if (agentDefinition?.agentFrameworkConfig) {
            finalConfig = agentDefinition.agentFrameworkConfig as AgentFrameworkConfig;
          }
          agentFrameworkID = agentDefinition?.agentFrameworkID;
        }

        if (agentFrameworkID) {
          try {
            const frameworkSchema = await window.service.agentInstance.getFrameworkConfigSchema(agentFrameworkID);
            setSchema(frameworkSchema);
          } catch (error) {
            void window.service.native.log('error', 'Failed to load framework schema', { function: 'useAgentFrameworkConfigManagement.fetchConfig', error });
          }
        }

        setConfig(finalConfig);
        setLoading(false);
      } catch (error) {
        void window.service.native.log('error', 'Failed to load framework configuration', { function: 'useAgentFrameworkConfigManagement.fetchConfig', error });
        setLoading(false);
      }
    };

    void fetchConfig();
  }, [agentDefId, agentId]);

  const persistConfig = useCallback(async (newConfig: AgentFrameworkConfig) => {
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
        }
      } else {
        void window.service.native.log('error', 'No agent ID or definition ID provided for updating handler config', {
          function: 'useAgentFrameworkConfigManagement.persistConfig',
        });
      }
    } catch (error) {
      void window.service.native.log('error', 'Failed to update framework configuration', { function: 'useAgentFrameworkConfigManagement.persistConfig', error });
    }
  }, [agentId, agentDefId]);

  const handleConfigChange = useCallback(async (newConfig: AgentFrameworkConfig) => {
    setConfig(newConfig);
    await persistConfig(newConfig);
  }, [persistConfig]);

  return {
    loading,
    config,
    setConfig,
    schema,
    persistConfig,
    handleConfigChange,
  };
};
