import { List } from '@mui/material';
import { useTranslation } from 'react-i18next';

import { ListItemText } from '@/components/ListItem';
import type { ICustomSectionProps } from '@services/preferences/definitions/types';
import { ListItemVertical, Paper, SectionTitle } from '../../PreferenceComponents';
import { ProviderConfig } from './components/ProviderConfig';
import { useAIConfigManagement } from './useAIConfigManagement';

export function ExternalAPI(props: ICustomSectionProps): React.JSX.Element {
  const { t } = useTranslation('agent');
  const {
    loading,
    providers,
    setProviders,
    handleModelChange,
    handleEmbeddingModelChange,
    handleSpeechModelChange,
    handleImageGenerationModelChange,
    handleTranscriptionsModelChange,
  } = useAIConfigManagement();

  return (
    <>
      <SectionTitle ref={props.sectionRef}>
        {t('Preference.ExternalAPI')}
      </SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {loading ? <ListItemVertical>{t('Loading')}</ListItemVertical> : (
            <ListItemVertical>
              <ListItemText
                primary={t('Preference.ProviderConfiguration')}
                secondary={t('Preference.ProviderConfigurationDescription')}
              />
              <ProviderConfig
                providers={providers}
                setProviders={setProviders}
                changeDefaultModel={handleModelChange}
                changeDefaultEmbeddingModel={handleEmbeddingModelChange}
                changeDefaultSpeechModel={handleSpeechModelChange}
                changeDefaultImageGenerationModel={handleImageGenerationModelChange}
                changeDefaultTranscriptionsModel={handleTranscriptionsModelChange}
              />
            </ListItemVertical>
          )}
        </List>
      </Paper>
    </>
  );
}
