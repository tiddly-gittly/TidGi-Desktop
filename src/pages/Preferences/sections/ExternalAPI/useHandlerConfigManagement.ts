/* eslint-disable unicorn/prevent-abbreviations */
import { AgentPromptDescription } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { getDiffConfig } from '@services/externalAPI/getDiffConfig';
import { useCallback, useEffect, useState } from 'react';
// Reuse mergeConfigs method from useAIConfigManagement
import { mergeConfigs } from './useAIConfigManagement';

type PromptConfig = AgentPromptDescription['promptConfig'];

interface UseHandlerConfigManagementProps {
  agentDefId?: string;
  agentId?: string;
}

interface UseHandlerConfigManagementResult {
  loading: boolean;
  config: PromptConfig | null;
  handleConfigChange: (newConfig: PromptConfig) => Promise<void>;
}

/**
 * Custom hook for managing agent handler/prompt configuration
 * Similar to useAIConfigManagement but for handler configuration
 */
export const useHandlerConfigManagement = ({ agentDefId, agentId }: UseHandlerConfigManagementProps = {}): UseHandlerConfigManagementResult => {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<PromptConfig | null>(null);
  // Store configurations from different levels for comparison
  const [defConfig, setDefConfig] = useState<PromptConfig | null>(null);
  // We keep this to track instance level changes even if not used directly in comparison
  const [_instanceConfig, setInstanceConfig] = useState<PromptConfig | null>(null);

  // Load handler configuration
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        let agentDefConfig: PromptConfig | undefined;
        let agentInstanceConfig: PromptConfig | undefined;

        // 1. If agentDefId exists, get definition level config
        if (agentDefId) {
          const agentDef = await window.service.agentDefinition.getAgentDef(agentDefId);
          if (agentDef?.handlerConfig) {
            // Since handlerConfig is already validated to exist, we can safely cast it
            agentDefConfig = agentDef.handlerConfig as PromptConfig;
            // Save definition config for comparisons
            setDefConfig(agentDefConfig);
          }
        }

        // 2. If agentId exists, get instance level config (if any exists)
        if (agentId) {
          const agentInstance = await window.service.agentInstance.getAgent(agentId);
          if (agentInstance?.handlerConfig) {
            // Since handlerConfig is already validated to exist, we can safely cast it
            agentInstanceConfig = agentInstance.handlerConfig as PromptConfig;
            // Save instance config for comparisons
            setInstanceConfig(agentInstanceConfig);
          }
        }

        // Merge configs (by priority: definition < instance)
        const finalConfig = mergeConfigs(
          agentDefConfig,
          agentInstanceConfig,
        );

        setConfig(finalConfig);
        setLoading(false);
      } catch (error) {
        console.error('Failed to load handler configuration:', error);
        setLoading(false);
      }
    };

    void fetchConfig();
  }, [agentDefId, agentId]);

  // Handle full config change
  const handleConfigChange = useCallback(async (newConfig: PromptConfig) => {
    try {
      // Update local state
      setConfig(newConfig);

      // Determine which level to save based on priority
      if (agentId) {
        // Get differences from definition level config
        const compareConfig = defConfig;
        // Ensure we're getting a properly typed diff configuration
        const diffConfig = getDiffConfig(newConfig, compareConfig);

        // Only save if there are actual differences
        if (Object.keys(diffConfig).length > 0) {
          // For agent instances, we need to use a different approach
          // The actual implementation in the service will handle the handlerConfig field
          const agentInstance = await window.service.agentInstance.getAgent(agentId);
          if (agentInstance) {
            await window.service.agentInstance.updateAgent(agentId, {
              handlerConfig: diffConfig,
            });
          }
        } else {
          // If no differences, set handlerConfig to undefined to remove it
          await window.service.agentInstance.updateAgent(agentId, { handlerConfig: undefined });
        }
      } else if (agentDefId) {
        // Update definition level config directly
        const agentDef = await window.service.agentDefinition.getAgentDef(agentDefId);
        if (agentDef) {
          await window.service.agentDefinition.updateAgentDef({
            ...agentDef,
            // For agent definitions, handlerConfig is a proper field in the interface
            handlerConfig: newConfig,
          });
        }
      } else {
        console.error('No agent ID or definition ID provided for updating handler config');
      }
    } catch (error) {
      console.error('Failed to update handler configuration:', error);
    }
  }, [agentId, agentDefId, defConfig]);

  return {
    loading,
    config,
    handleConfigChange,
  };
};
