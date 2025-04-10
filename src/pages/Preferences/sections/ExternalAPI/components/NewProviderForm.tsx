import { Button, FormControl, InputLabel, MenuItem, Select, Typography } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { TextField } from '../../../PreferenceComponents';

// Add provider form styling
const FormSection = styled.div`
  margin-top: 24px;
  padding: 16px;
  background-color: ${props => props.theme.palette.background.default};
  border-radius: 8px;
  border: 1px solid ${props => props.theme.palette.divider};
`;

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

  return (
    <FormSection>
      <Typography variant='h6' sx={{ mb: 2 }}>
        {t('Preference.AddNewProvider')}
      </Typography>

      <TextField
        label={t('Preference.ProviderName')}
        value={formState.provider}
        onChange={(event) => {
          onChange({ provider: event.target.value });
        }}
        fullWidth
        margin='normal'
      />

      <FormControl fullWidth margin='normal'>
        <InputLabel>{t('Preference.ProviderClass')}</InputLabel>
        <Select
          value={formState.providerClass}
          onChange={(event) => {
            onChange({ providerClass: event.target.value });
          }}
          label={t('Preference.ProviderClass')}
        >
          {/* 从传入的 providerClasses 动态生成菜单项 */}
          {providerClasses.map((providerClass) => (
            <MenuItem key={providerClass} value={providerClass}>
              {t(`Preference.${providerClass.charAt(0).toUpperCase() + providerClass.slice(1)}`)}
            </MenuItem>
          ))}
          {/* 始终包含自定义选项 */}
          <MenuItem value='custom'>{t('Preference.Custom')}</MenuItem>
        </Select>
      </FormControl>

      {/* 只有特定提供方类型需要 baseURL */}
      {(formState.providerClass === 'openAICompatible' || 
        formState.providerClass === 'ollama' || 
        formState.providerClass === 'custom') && (
        <TextField
          label={t('Preference.BaseURL')}
          value={formState.baseURL}
          onChange={(event) => {
            onChange({ baseURL: event.target.value });
          }}
          fullWidth
          margin='normal'
          placeholder={
            formState.providerClass === 'ollama' ? 
              'http://localhost:11434' : 
              'https://api.example.com/v1'
          }
        />
      )}

      <Button
        variant='contained'
        color='primary'
        onClick={onSubmit}
        style={{ marginTop: 16 }}
        fullWidth
      >
        {t('Preference.AddProvider')}
      </Button>
    </FormSection>
  );
}
