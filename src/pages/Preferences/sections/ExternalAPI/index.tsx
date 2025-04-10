import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { List } from '@mui/material';

import { ListItemText } from '@/components/ListItem';
import { ListItemVertical, Paper, SectionTitle } from '../../PreferenceComponents';
import type { ISectionProps } from '../../useSections';
import { ModelSelector } from './components/ModelSelector';
import { ProviderConfig } from './components/ProviderConfig';
import { useModelOptions } from './hooks/useModelOptions';
import { ModelOption } from './types';

export function ExternalAPI(props: Partial<ISectionProps>): React.JSX.Element {
  const { t } = useTranslation('agent');
  const [loading, setLoading] = useState(true);

  const [_defaultConfig, setDefaultConfig] = useState<{
    provider: string;
    model: string;
  }>({
    provider: '',
    model: '',
  });

  const { modelOptions, selectedModelOption, setSelectedModelOption, providers } = useModelOptions();
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const config = await window.service.externalAPI.getAIConfig();

        setDefaultConfig({
          provider: config.provider,
          model: config.model,
        });
      } catch (error) {
        console.error('Failed to load AI configuration:', error);
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, []);

  // Update configuration
  const updateConfig = async (key: string, value: unknown) => {
    try {
      setDefaultConfig(previousConfig => ({
        ...previousConfig,
        [key]: value,
      }));

      await window.service.externalAPI.updateDefaultAIConfig({ [key]: value });
    } catch (error) {
      console.error(`Failed to update ${key}:`, error);
    }
  };

  // Handle model selection change
  const handleModelOptionChange = (option: ModelOption | null) => {
    if (option) {
      setSelectedModelOption(option);
      void updateConfig('provider', option.provider);
      void updateConfig('model', option.model);
    }
  };

  return (
    <>
      <SectionTitle ref={props.sections?.externalAPI.ref}>{t('Preference.ExternalAPI')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {loading ? <ListItemVertical>{t('Loading')}</ListItemVertical> : (
            <>
              <ListItemVertical>
                <ListItemText
                  primary={t('Preference.DefaultAIModelSelection')}
                  secondary={t('Preference.DefaultAIModelSelectionDescription')}
                />
                <ModelSelector
                  selectedModelOption={selectedModelOption}
                  modelOptions={modelOptions}
                  onChange={handleModelOptionChange}
                />
              </ListItemVertical>

              {/* Provider configuration section */}
              <ProviderConfig providers={providers} />
            </>
          )}
        </List>
      </Paper>
    </>
  );
}
