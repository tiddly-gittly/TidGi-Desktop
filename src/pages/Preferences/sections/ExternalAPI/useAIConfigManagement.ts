import { AiAPIConfig } from '@services/agentInstance/buildInAgentHandlers/promptConcatUtils/promptConcatSchema';
import { AIProviderConfig } from '@services/externalAPI/interface';
import { useEffect, useState } from 'react';

interface UseAIConfigManagementProps {
  taskId?: string;
}

interface UseAIConfigManagementResult {
  loading: boolean;
  config: AiAPIConfig | null;
  providers: AIProviderConfig[];
  setProviders: React.Dispatch<React.SetStateAction<AIProviderConfig[]>>;
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
        // Get task-specific configuration
        const taskConfig = await window.service.agent.getAIConfigByIds(taskId);
        setConfig(taskConfig);

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
      const updatedConfig: AiAPIConfig = {
        ...config,
        api: {
          provider,
          model,
        },
      };

      setConfig(updatedConfig);
      if (taskId) {
        await window.service.agent.updateTaskAIConfig(taskId, updatedConfig);
      } else {
        // update global config when no taskID provided
        await window.service.externalAPI.updateDefaultAIConfig(updatedConfig);
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
    setProviders,
    handleModelChange,
    handleConfigChange,
  };
};