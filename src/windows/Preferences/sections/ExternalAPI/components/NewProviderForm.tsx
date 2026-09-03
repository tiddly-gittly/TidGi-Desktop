import { Box, Button, FormControl, InputLabel, MenuItem, Select, TextField, Typography } from '@mui/material';
import type { ModelCatalogProvider } from 'memeloop';
import React from 'react';
import { useTranslation } from 'react-i18next';

interface NewProviderFormProps {
  formState: { providerId: string; providerType: string; baseUrl: string };
  providerTypes: string[];
  availableCatalogProviders: ModelCatalogProvider[];
  selectedCatalogProviderId: string;
  onCatalogProviderSelect: (providerId: string) => void;
  onChange: (updates: Partial<{ providerId: string; providerType: string; baseUrl: string }>) => void;
  onSubmit: () => void;
}

export function NewProviderForm({
  formState,
  providerTypes,
  availableCatalogProviders,
  selectedCatalogProviderId,
  onCatalogProviderSelect,
  onChange,
  onSubmit,
}: NewProviderFormProps) {
  const { t } = useTranslation('agent');
  const showBaseUrl = formState.providerType === 'openai-compatible' || formState.providerType === 'ollama';
  return (
    <Box sx={{ mt: 2, mb: 3, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
      <Typography variant='h6' sx={{ mb: 2 }}>{t('Preference.AddNewProvider')}</Typography>
      <FormControl fullWidth margin='normal'>
        <InputLabel id='catalog-provider-label'>{t('Preference.SelectDefaultProvider')}</InputLabel>
        <Select
          data-testid='new-provider-preset-select'
          labelId='catalog-provider-label'
          value={selectedCatalogProviderId}
          onChange={event => {
            onCatalogProviderSelect(event.target.value);
          }}
          label={t('Preference.SelectDefaultProvider')}
        >
          <MenuItem value=''>
            <em>{t('Preference.CustomProvider')}</em>
          </MenuItem>
          {availableCatalogProviders.map(provider => <MenuItem key={provider.id} value={provider.id}>{provider.name}</MenuItem>)}
        </Select>
      </FormControl>
      <TextField
        label={t('Preference.ProviderName')}
        value={formState.providerId}
        onChange={event => {
          onChange({ providerId: event.target.value });
        }}
        fullWidth
        margin='normal'
        placeholder='my-ai-provider'
        slotProps={{ htmlInput: { 'data-testid': 'new-provider-name-input' } }}
      />
      <FormControl fullWidth margin='normal'>
        <InputLabel id='provider-type-label'>{t('Preference.ProviderType')}</InputLabel>
        <Select
          data-testid='new-provider-type-select'
          labelId='provider-type-label'
          value={formState.providerType}
          onChange={event => {
            onChange({ providerType: event.target.value });
          }}
          label={t('Preference.ProviderType')}
        >
          {providerTypes.map(providerType => <MenuItem key={providerType} value={providerType}>{providerType}</MenuItem>)}
        </Select>
      </FormControl>
      {showBaseUrl && (
        <TextField
          label={t('Preference.BaseURL')}
          value={formState.baseUrl}
          onChange={event => {
            onChange({ baseUrl: event.target.value });
          }}
          fullWidth
          margin='normal'
          placeholder={formState.providerType === 'ollama'
            ? 'http://localhost:11434'
            : 'https://api.example.com/v1'}
          helperText={formState.providerType === 'openai-compatible'
            ? t('Preference.OpenAICompatibleBaseURLDescription')
            : undefined}
          slotProps={{ htmlInput: { 'data-testid': 'new-provider-base-url-input' } }}
        />
      )}
      <Button variant='contained' onClick={onSubmit} fullWidth sx={{ mt: 2 }} data-testid='add-provider-submit-button'>
        {t('Preference.AddProvider')}
      </Button>
    </Box>
  );
}
