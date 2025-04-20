/* eslint-disable unicorn/prevent-abbreviations */
import { Box, Button, FormControl, InputLabel, MenuItem, Select, TextField, Typography } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';

// New provider form state
interface NewProviderFormState {
  provider: string;
  providerClass: string;
  baseURL: string;
}

interface NewProviderFormProps {
  formState: NewProviderFormState;
  providerClasses: string[];
  onChange: (updates: Partial<NewProviderFormState>) => void;
  onSubmit: () => void;
}

export function NewProviderForm({ formState, providerClasses, onChange, onSubmit }: NewProviderFormProps) {
  const { t } = useTranslation('agent');

  const showBaseURLField = formState.providerClass === 'openAICompatible' ||
    formState.providerClass === 'ollama';

  return (
    <Box sx={{ mt: 2, mb: 3, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
      <Typography variant='h6' sx={{ mb: 2 }}>
        {t('Preference.AddNewProvider')}
      </Typography>

      <TextField
        label={t('Preference.ProviderName')}
        value={formState.provider}
        onChange={(e) => {
          onChange({ provider: e.target.value });
        }}
        fullWidth
        margin='normal'
        placeholder='my-ai-provider'
      />

      <FormControl fullWidth margin='normal'>
        <InputLabel id='provider-class-label'>{t('Preference.ProviderClass')}</InputLabel>
        <Select
          labelId='provider-class-label'
          value={formState.providerClass}
          onChange={(e) => {
            onChange({ providerClass: e.target.value });
          }}
          label={t('Preference.ProviderClass')}
        >
          {providerClasses.map((cls) => (
            <MenuItem key={cls} value={cls}>
              {cls}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {showBaseURLField && (
        <TextField
          label={t('Preference.BaseURL')}
          value={formState.baseURL}
          onChange={(e) => {
            onChange({ baseURL: e.target.value });
          }}
          fullWidth
          margin='normal'
          placeholder={formState.providerClass === 'ollama'
            ? 'http://localhost:11434'
            : 'https://api.example.com/v1'}
        />
      )}

      <Button
        variant='contained'
        color='primary'
        onClick={onSubmit}
        fullWidth
        sx={{ mt: 2 }}
      >
        {t('Preference.AddProvider')}
      </Button>
    </Box>
  );
}
