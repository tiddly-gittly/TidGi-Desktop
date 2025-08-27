/* eslint-disable unicorn/prevent-abbreviations */
import { HandlerConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { useCallback, useEffect, useState } from 'react';

interface UseHandlerConfigManagementProps {
  agentDefId?: string;
  agentId?: string;
}

interface UseHandlerConfigManagementResult {
  loading: boolean;
  config: HandlerConfig | undefined;
  schema?: Record<string, unknown>;
  handleConfigChange: (newConfig: HandlerConfig) => Promise<void>;
}

export const useHandlerConfigManagement = ({ agentDefId, agentId }: UseHandlerConfigManagementProps = {}): UseHandlerConfigManagementResult => {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<HandlerConfig | undefined>(undefined);
  const [schema, setSchema] = useState<Record<string, unknown> | undefined>(undefined);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        let finalConfig: HandlerConfig | undefined;
        let handlerID: string | undefined;

        if (agentId) {
          const agentInstance = await window.service.agentInstance.getAgent(agentId);
          let agentDef: Awaited<ReturnType<typeof window.service.agentDefinition.getAgentDef>> | undefined;
          if (agentInstance?.agentDefId) {
            agentDef = await window.service.agentDefinition.getAgentDef(agentInstance.agentDefId);
          }
          // Use instance config if available, otherwise fallback to definition config
          if (agentInstance?.handlerConfig && Object.keys(agentInstance.handlerConfig).length > 0) {
            finalConfig = agentInstance.handlerConfig as HandlerConfig;
          } else if (agentDef?.handlerConfig) {
            finalConfig = agentDef.handlerConfig as HandlerConfig;
          }
          // Use handlerID from instance, fallback to definition
          handlerID = agentInstance?.handlerID || agentDef?.handlerID;
        } else if (agentDefId) {
          const agentDef = await window.service.agentDefinition.getAgentDef(agentDefId);
          if (agentDef?.handlerConfig) {
            finalConfig = agentDef.handlerConfig as HandlerConfig;
          }
          handlerID = agentDef?.handlerID;
        }

        if (handlerID) {
          try {
            const handlerSchema = await window.service.agentInstance.getHandlerConfigSchema(handlerID);
            setSchema(handlerSchema);
          } catch (error) {
            void window.service.native.log('error', 'Failed to load handler schema', { function: 'useHandlerConfigManagement.fetchConfig', error: String(error) });
          }
        }

        setConfig(finalConfig);
        setLoading(false);
      } catch (error) {
        void window.service.native.log('error', 'Failed to load handler configuration', { function: 'useHandlerConfigManagement.fetchConfig', error: String(error) });
        setLoading(false);
      }
    };

    void fetchConfig();
  }, [agentDefId, agentId]);

  const handleConfigChange = useCallback(async (newConfig: HandlerConfig) => {
    try {
      setConfig(newConfig);

      if (agentId) {
        await window.service.agentInstance.updateAgent(agentId, {
          handlerConfig: newConfig,
        });
      } else if (agentDefId) {
        const agentDef = await window.service.agentDefinition.getAgentDef(agentDefId);
        if (agentDef) {
          await window.service.agentDefinition.updateAgentDef({
            ...agentDef,
            handlerConfig: newConfig,
          });
        }
      } else {
        void window.service.native.log('error', 'No agent ID or definition ID provided for updating handler config', { function: 'useHandlerConfigManagement.handleConfigChange' });
      }
    } catch (error) {
      void window.service.native.log('error', 'Failed to update handler configuration', { function: 'useHandlerConfigManagement.handleConfigChange', error: String(error) });
    }
  }, [agentId, agentDefId]);

  return {
    loading,
    config,
    schema,
    handleConfigChange,
  };
};
