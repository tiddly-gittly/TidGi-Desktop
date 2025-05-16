/* eslint-disable unicorn/prevent-abbreviations */
import { AiAPIConfig } from '@services/agentInstance/buildInAgentHandlers/promptConcatUtils/promptConcatSchema';
import { getDiffConfig } from '@services/externalAPI/getDiffConfig';
import { AIProviderConfig } from '@services/externalAPI/interface';
import { cloneDeep, isUndefined, mergeWith } from 'lodash';
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
  handleConfigChange: (newConfig: AiAPIConfig) => Promise<void>;
}

/**
 * Merge multiple configurations, with later configs overriding earlier ones
 * @param configs Array of configurations to merge
 * @returns Merged configuration or null if no valid configs provided
 */
export const mergeConfigs = <T extends Record<string, unknown>>(...configs: (T | undefined | null)[]): T | null => {
  const validConfigs = configs.filter(config => config !== null);
  if (validConfigs.length === 0) return null;

  // Use first config as base
  const base = cloneDeep(validConfigs[0] || {}) as T;

  // Merge remaining configs sequentially
  for (let index = 1; index < validConfigs.length; index++) {
    const config = validConfigs[index];
    if (!config) continue;

    mergeWith(base, config, (objectValue: unknown, sourceValue: unknown): unknown => {
      // Handle undefined explicitly - if source value is explicitly undefined,
      // use it to override parent value (to support removing parent values)
      if (sourceValue === undefined) {
        return undefined;
      }

      // For all other cases, if source value exists, use it
      if (!isUndefined(sourceValue)) {
        return sourceValue;
      }

      return objectValue;
    });
  }

  return base;
};

export const useAIConfigManagement = ({ agentDefId, agentId }: UseAIConfigManagementProps = {}): UseAIConfigManagementResult => {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<AiAPIConfig | null>(null);
  const [providers, setProviders] = useState<AIProviderConfig[]>([]);
  // Store configurations from different levels for comparison
  const [globalConfig, setGlobalConfig] = useState<AiAPIConfig | null>(null);
  const [defConfig, setDefConfig] = useState<AiAPIConfig | null>(null);

  // Load AI configuration
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        // Get configurations by priority
        let agentDefConfig: Partial<AiAPIConfig> | undefined;
        let agentInstanceConfig: Partial<AiAPIConfig> | undefined;

        // 1. Get global default config
        const globalDefaultConfig = await window.service.externalAPI.getAIConfig();
        setGlobalConfig(globalDefaultConfig);

        // 2. If agentDefId exists, get definition level config
        if (agentDefId) {
          const agentDef = await window.service.agentDefinition.getAgentDef(agentDefId);
          if (agentDef?.aiApiConfig) {
            agentDefConfig = agentDef.aiApiConfig;
            const mergedDefConfig = mergeConfigs(globalDefaultConfig, agentDefConfig);
            // Fix: Type cast to match state type
            setDefConfig(mergedDefConfig as AiAPIConfig);
          }
        }

        // 3. If agentId exists, get instance level config
        if (agentId) {
          const agentInstance = await window.service.agentInstance.getAgent(agentId);
          if (agentInstance?.aiApiConfig) {
            agentInstanceConfig = agentInstance.aiApiConfig;
          }
        }

        // Merge all configs (by priority: global < definition < instance)
        const finalConfig = mergeConfigs(
          globalDefaultConfig,
          agentDefConfig,
          agentInstanceConfig,
        );

        // Fix: Type cast to match state type
        setConfig(finalConfig as AiAPIConfig);

        // Get AI provider list
        const providersData = await window.service.externalAPI.getAIProviders();
        setProviders(providersData);

        setLoading(false);
      } catch (error) {
        console.error('Failed to load AI configuration:', error);
        setLoading(false);
      }
    };

    void fetchConfig();
  }, [agentDefId, agentId]);

  // Handle model change
  const handleModelChange = useCallback(async (provider: string, model: string) => {
    if (!config) return;

    try {
      // Create updated config
      const updatedConfig = cloneDeep(config);
      // Fix: Check if api exists before accessing properties
      if (typeof updatedConfig.api === 'undefined') {
        // Initialize api object if it doesn't exist
        updatedConfig.api = { provider, model };
      } else {
        // Update existing api object
        updatedConfig.api.provider = provider;
        updatedConfig.api.model = model;
      }

      // Update local state
      setConfig(updatedConfig);

      // Determine which level to save based on priority
      if (agentId) {
        // Get differences from definition level config
        const compareConfig = defConfig || globalConfig;
        const diffConfig = getDiffConfig(updatedConfig, compareConfig);

        // Only save if there are actual differences
        if (Object.keys(diffConfig).length > 0) {
          // Update instance level config
          await window.service.agentInstance.updateAgent(agentId, { aiApiConfig: diffConfig });
        } else {
          // If no differences, set aiApiConfig to undefined to remove it
          await window.service.agentInstance.updateAgent(agentId, { aiApiConfig: undefined });
        }
      } else if (agentDefId) {
        // Get differences from global config
        const diffConfig = getDiffConfig(updatedConfig, globalConfig);

        // Update definition level config
        const agentDef = await window.service.agentDefinition.getAgentDef(agentDefId);
        if (agentDef) {
          if (Object.keys(diffConfig).length > 0) {
            await window.service.agentDefinition.updateAgentDef({
              ...agentDef,
              aiApiConfig: diffConfig,
            });
          } else {
            // If no differences, set aiApiConfig to undefined to remove it
            await window.service.agentDefinition.updateAgentDef({
              ...agentDef,
              aiApiConfig: undefined,
            });
          }
        }
      } else {
        // Update global default config
        await window.service.externalAPI.updateDefaultAIConfig(updatedConfig);
      }
    } catch (error) {
      console.error('Failed to update model configuration:', error);
    }
  }, [config, globalConfig, defConfig, agentId, agentDefId]);

  // Handle full config change
  const handleConfigChange = useCallback(async (newConfig: AiAPIConfig) => {
    try {
      // Update local state
      setConfig(newConfig);

      // Determine which level to save based on priority
      if (agentId) {
        // Get differences from definition level config
        const compareConfig = defConfig || globalConfig;
        const diffConfig = getDiffConfig(newConfig, compareConfig);

        // Only save if there are actual differences
        if (Object.keys(diffConfig).length > 0) {
          // Update instance level config
          await window.service.agentInstance.updateAgent(agentId, { aiApiConfig: diffConfig });
        } else {
          // If no differences, set aiApiConfig to undefined to remove it
          await window.service.agentInstance.updateAgent(agentId, { aiApiConfig: undefined });
        }
      } else if (agentDefId) {
        // Get differences from global config
        const diffConfig = getDiffConfig(newConfig, globalConfig);

        // Update definition level config
        const agentDef = await window.service.agentDefinition.getAgentDef(agentDefId);
        if (agentDef) {
          if (Object.keys(diffConfig).length > 0) {
            await window.service.agentDefinition.updateAgentDef({
              ...agentDef,
              aiApiConfig: diffConfig,
            });
          } else {
            // If no differences, set aiApiConfig to undefined to remove it
            await window.service.agentDefinition.updateAgentDef({
              ...agentDef,
              aiApiConfig: undefined,
            });
          }
        }
      } else {
        // Update global default config
        await window.service.externalAPI.updateDefaultAIConfig(newConfig);
      }
    } catch (error) {
      console.error('Failed to update configuration:', error);
    }
  }, [globalConfig, defConfig, agentId, agentDefId]);

  return {
    loading,
    config,
    providers,
    setProviders,
    handleModelChange,
    handleConfigChange,
  };
};
