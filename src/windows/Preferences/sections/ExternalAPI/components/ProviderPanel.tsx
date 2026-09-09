import { Visibility as VisibilityIcon, VisibilityOff as VisibilityOffIcon } from '@mui/icons-material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { Box, Button, Chip, FormControlLabel, IconButton, InputAdornment, Switch, Typography } from '@mui/material';
import type { ProviderAccountConfig } from 'memeloop';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { TextField } from '../../../PreferenceComponents';

interface ProviderPanelProps {
  account: ProviderAccountConfig;
  apiKey: string;
  baseUrl: string;
  onFormChange: (field: 'apiKey' | 'baseUrl', value: string) => void;
  onFieldCommit: (field: 'apiKey' | 'baseUrl') => void;
  onEnabledChange: (enabled: boolean) => void;
  onRemoveModel: (modelId: string) => void;
  onEditModel: (modelId: string) => void;
  onOpenAddModelDialog: () => void;
  onDeleteProvider: () => void;
  onRefreshModels: () => void;
  refreshingModels?: boolean;
  focusField?: 'apiKey' | 'baseUrl' | 'model' | 'apiMode';
  focusModelId?: string;
}

export function ProviderPanel({
  account,
  apiKey,
  baseUrl,
  onFormChange,
  onFieldCommit,
  onEnabledChange,
  onRemoveModel,
  onEditModel,
  onOpenAddModelDialog,
  onDeleteProvider,
  onRefreshModels,
  refreshingModels = false,
  focusField,
  focusModelId,
}: ProviderPanelProps) {
  const { t } = useTranslation('agent');
  const [showApiKey, setShowApiKey] = useState(true);
  const rootReference = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusField) return;
    const testId = focusField === 'apiKey'
      ? 'provider-api-key-input'
      : focusField === 'baseUrl'
      ? 'provider-base-url-input'
      : 'add-new-model-button';
    const modelElement = focusModelId === undefined
      ? undefined
      : [...(rootReference.current?.querySelectorAll<HTMLElement>('[data-provider-model-id]') ?? [])]
        .find(candidate => candidate.dataset.providerModelId === focusModelId);
    const element = modelElement ?? rootReference.current?.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element?.focus();
  }, [focusField, focusModelId]);

  return (
    <Box ref={rootReference}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant='h6'>
          {t('Preference.ConfigureProvider', { provider: account.catalogProvider?.name ?? account.providerId })}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FormControlLabel
            control={
              <Switch
                checked={account.enabled !== false}
                onChange={event => {
                  onEnabledChange(event.target.checked);
                }}
              />
            }
            label={t('Preference.EnableProvider')}
          />
          <Button color='error' size='small' startIcon={<DeleteIcon />} onClick={onDeleteProvider} data-testid='delete-provider-button'>
            {t('Preference.DeleteProvider')}
          </Button>
        </Box>
      </Box>
      <TextField
        label={t('Preference.APIKey')}
        type={showApiKey ? 'text' : 'password'}
        value={apiKey}
        onChange={event => {
          onFormChange('apiKey', event.target.value);
        }}
        onBlur={() => {
          onFieldCommit('apiKey');
        }}
        fullWidth
        margin='normal'
        disabled={account.providerType === 'ollama'}
        slotProps={{
          htmlInput: { 'data-testid': 'provider-api-key-input' },
          input: {
            endAdornment: (
              <InputAdornment position='end'>
                <IconButton
                  onClick={() => {
                    setShowApiKey(value => !value);
                  }}
                  edge='end'
                  size='small'
                  aria-label={showApiKey ? t('Preference.HideAPIKey') : t('Preference.ShowAPIKey')}
                >
                  {showApiKey ? <VisibilityOffIcon fontSize='small' /> : <VisibilityIcon fontSize='small' />}
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
      />
      {(account.providerType === 'openai-compatible' || account.providerType === 'ollama' || account.baseUrl) && (
        <TextField
          label={t('Preference.BaseURL')}
          value={baseUrl}
          onChange={event => {
            onFormChange('baseUrl', event.target.value);
          }}
          onBlur={() => {
            onFieldCommit('baseUrl');
          }}
          fullWidth
          margin='normal'
          placeholder={account.providerType === 'ollama' ? 'http://localhost:11434' : 'https://api.example.com/v1'}
          helperText={account.providerType === 'openai-compatible'
            ? t('Preference.OpenAICompatibleBaseURLDescription')
            : undefined}
          slotProps={{ htmlInput: { 'data-testid': 'provider-base-url-input' } }}
        />
      )}
      <Box sx={{ mt: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant='subtitle1'>{t('Preference.Models')}</Typography>
          <Button variant='outlined' size='small' onClick={onRefreshModels} disabled={refreshingModels} data-testid='refresh-official-models-button'>
            {refreshingModels ? t('Preference.RefreshingOfficialModels') : t('Preference.RefreshOfficialModels')}
          </Button>
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
          {account.models.map(route => {
            const model = account.catalogProvider?.models.find(candidate => candidate.id === route.modelId || candidate.id === route.wireModelId);
            return (
              <Chip
                key={route.modelId}
                label={model?.name ?? route.modelId}
                onClick={() => {
                  onEditModel(route.modelId);
                }}
                onDelete={() => {
                  onRemoveModel(route.modelId);
                }}
                data-testid={`model-chip-${route.modelId}`}
                data-provider-model-id={route.modelId}
              />
            );
          })}
        </Box>
        <Button variant='contained' startIcon={<AddIcon />} onClick={onOpenAddModelDialog} fullWidth data-testid='add-new-model-button'>
          {t('Preference.AddNewModel')}
        </Button>
      </Box>
    </Box>
  );
}
