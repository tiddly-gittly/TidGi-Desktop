import React from 'react';
import { useTranslation } from 'react-i18next';

import { List } from '@mui/material';

import { ListItemText } from '@/components/ListItem';
import { useTaskConfigManagement } from '@/pages/Agent/AgentSessions/components/useAIConfigManagement';
import { AIProviderConfig, ModelInfo } from '@services/externalAPI/interface';
import { ListItemVertical, Paper, SectionTitle } from '../../PreferenceComponents';
import type { ISectionProps } from '../../useSections';
import { ModelSelector } from './components/ModelSelector';
import { ProviderConfig } from './components/ProviderConfig';

export function ExternalAPI(props: Partial<ISectionProps>): React.JSX.Element {
  const { t } = useTranslation('agent');
  const { loading, config, providers, handleModelChange } = useTaskConfigManagement();

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
                  selectedConfig={config}
                  modelOptions={providers.flatMap(provider => provider.models.map(model => [provider, model] as [AIProviderConfig, ModelInfo]))}
                  onChange={handleModelChange}
                />
              </ListItemVertical>

              <ProviderConfig providers={providers} />
            </>
          )}
        </List>
      </Paper>
    </>
  );
}
