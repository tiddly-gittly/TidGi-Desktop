import { AIProviderConfig } from '@services/agent/interface';
import { useEffect, useState } from 'react';
import { ModelOption } from '../types';

export function useModelOptions() {
  const [providers, setProviders] = useState<AIProviderConfig[]>([]);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [selectedModelOption, setSelectedModelOption] = useState<ModelOption | null>(null);

  useEffect(() => {
    const loadProviders = async () => {
      try {
        const allProviders = await window.service.agent.getAIProviders();
        setProviders(allProviders);
        const config = await window.service.agent.getAIConfig();
        // Create model options array - only for enabled providers
        const options: ModelOption[] = [];
        const enabledProviders = allProviders.filter(provider => provider.enabled !== false);

        enabledProviders.forEach(provider => {
          provider.models.forEach(model => {
            options.push({
              provider: provider.provider,
              model: model.name,
              caption: model.caption || model.name,
              features: model.features || [],
              groupLabel: provider.provider,
            });
          });
        });

        setModelOptions(options);

        // Set currently selected model
        const currentOption = options.find(
          option => option.provider === config.provider && option.model === config.model,
        );

        if (currentOption) {
          setSelectedModelOption(currentOption);
        } else if (options.length > 0) {
          // If current model is from a disabled provider, select first available model
          setSelectedModelOption(options[0]);

          // Update default config
          await window.service.agent.updateDefaultAIConfig({
            provider: options[0].provider,
            model: options[0].model,
          });
        }
      } catch (error) {
        console.error('Failed to load AI providers or config:', error);
      }
    };

    void loadProviders();
  }, []);

  return { providers, modelOptions, selectedModelOption, setSelectedModelOption };
}
