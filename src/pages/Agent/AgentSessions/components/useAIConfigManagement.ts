import { AiAPIConfig } from '@services/agent/defaultAgents/schemas';
import { AIProviderConfig } from '@services/externalAPI/interface';
import { useEffect, useState } from 'react';

interface UseAIConfigManagementProps {
  taskId?: string;
}

interface UseAIConfigManagementResult {
  loading: boolean;
  config: AiAPIConfig | null;
  providers: AIProviderConfig[];
  handleModelChange: (provider: string, model: string) => Promise<void>;
  handleConfigChange: (newConfig: AiAPIConfig) => Promise<void>;
}

export const useTaskConfigManagement = ({ taskId }: UseAIConfigManagementProps = {}): UseAIConfigManagementResult => {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<AiAPIConfig | null>(null);
  const [providers, setProviders] = useState<AIProviderConfig[]>([]);

  // Load AI configuration
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        if (taskId) {
          // Get task-specific configuration
          const taskConfig = await window.service.agent.getAIConfigByIds(taskId);
          setConfig(taskConfig);
        } else {
          // Get default configuration
          const defaultConfig = await window.service.agent.getAIConfigByIds();
          setConfig(defaultConfig);
        }

        // Get AI providers list
        const providersData = await window.service.externalAPI.getAIProviders();
        setProviders(providersData);

        setLoading(false);
      } catch (error) {
        console.error('Failed to load AI configuration:', error);
        setLoading(false);
      }
    };

    void fetchConfig();
  }, [taskId]);

  // Handle model change
  const handleModelChange = async (provider: string, model: string) => {
    if (!config) return;

    try {
      // For task-specific configuration
      const updatedConfig = {
        ...config,
        provider,
        model,
      };

      // Update local state
      setConfig(updatedConfig);
      if (taskId) {
        // Update backend
        await window.service.agent.updateTaskAIConfig(taskId, updatedConfig);
      }
    } catch (error) {
      console.error('Failed to update model configuration:', error);
    }
  };

  // Handle full config change (only for task-specific configurations)
  const handleConfigChange = async (newConfig: AiAPIConfig) => {
    if (!taskId) return;

    try {
      // Update local state
      setConfig(newConfig);

      // Update backend
      await window.service.agent.updateTaskAIConfig(taskId, newConfig);
    } catch (error) {
      console.error('Failed to update task configuration:', error);
    }
  };

  return {
    loading,
    config,
    providers,
    handleModelChange,
    handleConfigChange,
  };
};
