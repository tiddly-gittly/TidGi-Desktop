import { agentFrameworkConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { useCallback, useEffect, useState } from 'react';

interface useAgentFrameworkConfigManagementProps {
  agentDefId?: string;
  agentId?: string;
}

interface useAgentFrameworkConfigManagementResult {
  loading: boolean;
  config: agentFrameworkConfig | undefined;
  schema?: Record<string, unknown>;
  handleConfigChange: (newConfig: agentFrameworkConfig) => Promise<void>;
}

export const useAgentFrameworkConfigManagement = ({ agentDefId, agentId }: useAgentFrameworkConfigManagementProps = {}): useAgentFrameworkConfigManagementResult => {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<agentFrameworkConfig | undefined>(undefined);
  const [schema, setSchema] = useState<Record<string, unknown> | undefined>(undefined);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        let finalConfig: agentFrameworkConfig | undefined;
        let agentFrameworkID: string | undefined;

        if (agentId) {
          const agentInstance = await window.service.agentInstance.getAgent(agentId);
          let agentDefinition: Awaited<ReturnType<typeof window.service.agentDefinition.getAgentDef>> | undefined;
          if (agentInstance?.agentDefId) {
            agentDefinition = await window.service.agentDefinition.getAgentDef(agentInstance.agentDefId);
          }
          // Use instance config if available, otherwise fallback to definition config
          if (agentInstance?.agentFrameworkConfig && Object.keys(agentInstance.agentFrameworkConfig).length > 0) {
            finalConfig = agentInstance.agentFrameworkConfig as agentFrameworkConfig;
          } else if (agentDefinition?.agentFrameworkConfig) {
            finalConfig = agentDefinition.agentFrameworkConfig as agentFrameworkConfig;
          }
          // Use agentFrameworkID from instance, fallback to definition
          agentFrameworkID = agentInstance?.agentFrameworkID || agentDefinition?.agentFrameworkID;
        } else if (agentDefId) {
          const agentDefinition = await window.service.agentDefinition.getAgentDef(agentDefId);
          if (agentDefinition?.agentFrameworkConfig) {
            finalConfig = agentDefinition.agentFrameworkConfig as agentFrameworkConfig;
          }
          agentFrameworkID = agentDefinition?.agentFrameworkID;
        }

        if (agentFrameworkID) {
          try {
            const frameworkSchema = await window.service.agentInstance.getFrameworkConfigSchema(agentFrameworkID);
            setSchema(frameworkSchema);
          } catch (error) {
            void window.service.native.log('error', 'Failed to load handler schema', { function: 'useAgentFrameworkConfigManagement.fetchConfig', error });
          }
        }

        setConfig(finalConfig);
        setLoading(false);
      } catch (error) {
        void window.service.native.log('error', 'Failed to load handler configuration', { function: 'useAgentFrameworkConfigManagement.fetchConfig', error });
        setLoading(false);
      }
    };

    void fetchConfig();
  }, [agentDefId, agentId]);

  const handleConfigChange = useCallback(async (newConfig: agentFrameworkConfig) => {
    try {
      setConfig(newConfig);

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
          function: 'useAgentFrameworkConfigManagement.handleConfigChange',
        });
      }
    } catch (error) {
      void window.service.native.log('error', 'Failed to update handler configuration', { function: 'useAgentFrameworkConfigManagement.handleConfigChange', error });
    }
  }, [agentId, agentDefId]);

  return {
    loading,
    config,
    schema,
    handleConfigChange,
  };
};
