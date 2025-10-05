import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { Box, Button, Chip, FormControlLabel, Switch, Typography } from '@mui/material';
import { AIProviderConfig, ModelFeature, ModelInfo } from '@services/externalAPI/interface';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { TextField } from '../../../PreferenceComponents';

interface ProviderPanelProps {
  provider: AIProviderConfig;
  formState: {
    apiKey: string;
    baseURL: string;
    models: ModelInfo[];
    newModel?: {
      name: string;
      caption: string;
      features: ModelFeature[];
    };
  };
  onFormChange: (field: string, value: string) => void;
  onEnabledChange: (enabled: boolean) => void;
  onRemoveModel: (modelName: string) => void;
  onEditModel?: (modelName: string) => void;
  onOpenAddModelDialog: () => void;
  onDeleteProvider?: () => void;
}

export function ProviderPanel({
  provider,
  formState,
  onFormChange,
  onEnabledChange,
  onRemoveModel,
  onEditModel,
  onOpenAddModelDialog,
  onDeleteProvider,
}: ProviderPanelProps) {
  const { t } = useTranslation('agent');
  const isEnabled = provider.enabled !== false;
  const shouldShowBaseURL = provider.showBaseURLField || provider.providerClass === 'openAICompatible';

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          <Typography variant='h6'>
            {t('Preference.ConfigureProvider', { provider: provider.provider })}
          </Typography>
          {provider.isPreset && (
            <Typography variant='caption' color='textSecondary' sx={{ ml: 1 }}>
              ({t('Preference.PresetProvider')})
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
          <FormControlLabel
            control={
              <Switch
                checked={isEnabled}
                onChange={(event) => {
                  onEnabledChange(event.target.checked);
                }}
                name='providerEnabled'
                color='primary'
              />
            }
            label={t('Preference.EnableProvider')}
          />
          {/* Delete Provider Button - show when delete handler provided (allow deleting presets) */}
          {onDeleteProvider && (
            <Button
              variant='text'
              color='error'
              size='small'
              startIcon={<DeleteIcon />}
              onClick={onDeleteProvider}
              sx={{ fontSize: '0.75rem', minWidth: 'auto' }}
              data-testid='delete-provider-button'
            >
              {t('Preference.DeleteProvider')}
            </Button>
          )}
        </Box>
      </Box>

      {!isEnabled && (
        <Typography
          variant='body2'
          color='textSecondary'
          sx={{
            mb: 2,
            p: 1,
            bgcolor: 'background.paper',
            borderLeft: '4px solid',
            borderColor: 'warning.main',
          }}
        >
          {t('Preference.DisabledProviderInfo')}
        </Typography>
      )}

      <TextField
        label={t('Preference.APIKey')}
        type='password'
        value={formState.apiKey}
        onChange={(event) => {
          onFormChange('apiKey', event.target.value);
        }}
        fullWidth
        margin='normal'
        disabled={provider.providerClass === 'ollama'} // Ollama doesn't require API key
        slotProps={{ htmlInput: { 'data-testid': 'provider-api-key-input' } }}
      />

      {/* Show baseURL field (if needed) */}
      {shouldShowBaseURL && (
        <TextField
          label={t('Preference.BaseURL')}
          value={formState.baseURL}
          onChange={(event) => {
            onFormChange('baseURL', event.target.value);
          }}
          fullWidth
          margin='normal'
          placeholder={provider.providerClass === 'ollama'
            ? 'http://localhost:11434'
            : 'https://api.example.com/v1'}
          slotProps={{ htmlInput: { 'data-testid': 'provider-base-url-input' } }}
        />
      )}

      {/* Models section */}
      <Box sx={{ mt: 3 }}>
        <Typography variant='subtitle1' gutterBottom>{t('Preference.Models')}</Typography>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
          {formState.models.map((model) => (
            <Chip
              key={model.name}
              label={model.caption || model.name}
              onClick={() => {
                onEditModel?.(model.name);
              }}
              onDelete={() => {
                onRemoveModel(model.name);
              }}
              sx={{ mb: 1, cursor: 'pointer' }}
              data-testid={`model-chip-${model.name}`}
            />
          ))}
        </Box>

        <Button
          variant='contained'
          startIcon={<AddIcon />}
          onClick={onOpenAddModelDialog}
          fullWidth
          data-testid='add-new-model-button'
        >
          {t('Preference.AddNewModel')}
        </Button>
      </Box>
    </>
  );
}
