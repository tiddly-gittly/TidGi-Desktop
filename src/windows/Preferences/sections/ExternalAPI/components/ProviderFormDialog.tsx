import { Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, InputLabel, MenuItem, Select, Switch, TextField } from '@mui/material';
import { AIProviderConfig } from '@services/providerRegistry/interface';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ProviderFormDialogProps {
  open: boolean;
  provider: AIProviderConfig | null;
  onClose: () => void;
  onSave: (provider: Partial<AIProviderConfig>) => Promise<void>;
}

const PROVIDER_CLASSES = [
  'openai',
  'openAICompatible',
  'anthropic',
  'deepseek',
  'ollama',
  'comfyui',
  'custom',
];

export function ProviderFormDialog({
  open,
  provider,
  onClose,
  onSave,
}: ProviderFormDialogProps): React.JSX.Element {
  const { t } = useTranslation('agent');
  const [formData, setFormData] = useState({
    provider: '',
    baseURL: '',
    apiKey: '',
    providerClass: 'openAICompatible',
    enabled: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (provider) {
      setFormData({
        provider: provider.provider,
        baseURL: provider.baseURL || '',
        apiKey: provider.apiKey || '',
        providerClass: provider.providerClass || 'openAICompatible',
        enabled: provider.enabled !== false,
      });
    } else {
      setFormData({
        provider: '',
        baseURL: '',
        apiKey: '',
        providerClass: 'openAICompatible',
        enabled: true,
      });
    }
  }, [provider, open]);

  const handleChange = (
    field: keyof typeof formData,
    value: string | boolean,
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!formData.provider.trim()) {
      return;
    }

    setSaving(true);
    try {
      await onSave({
        provider: formData.provider,
        baseURL: formData.baseURL || undefined,
        apiKey: formData.apiKey || undefined,
        providerClass: formData.providerClass,
        enabled: formData.enabled,
        models: provider?.models || [],
        isPreset: false,
      });
    } finally {
      setSaving(false);
    }
  };

  const isEditing = provider !== null;
  const showBaseURLField = formData.providerClass === 'openAICompatible' ||
    formData.providerClass === 'ollama' ||
    formData.providerClass === 'comfyui';

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>
        {isEditing
          ? t('Preference.EditProvider')
          : t('Preference.AddCustomProvider')}
      </DialogTitle>
      <DialogContent>
        <TextField
          label={t('Preference.ProviderName')}
          value={formData.provider}
          onChange={(e) => handleChange('provider', e.target.value)}
          fullWidth
          margin='normal'
          disabled={isEditing}
          required
          placeholder='my-custom-provider'
          helperText={isEditing
            ? t('Preference.ProviderNameCannotBeChanged')
            : t('Preference.ProviderNameHelp')}
        />

        <FormControl fullWidth margin='normal'>
          <InputLabel>{t('Preference.ProviderClass')}</InputLabel>
          <Select
            value={formData.providerClass}
            onChange={(e) => handleChange('providerClass', e.target.value)}
            label={t('Preference.ProviderClass')}
          >
            {PROVIDER_CLASSES.map((cls) => (
              <MenuItem key={cls} value={cls}>
                {cls}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {showBaseURLField && (
          <TextField
            label={t('Preference.BaseURL')}
            value={formData.baseURL}
            onChange={(e) => handleChange('baseURL', e.target.value)}
            fullWidth
            margin='normal'
            placeholder={formData.providerClass === 'ollama'
              ? 'http://localhost:11434'
              : formData.providerClass === 'comfyui'
              ? 'http://localhost:8188'
              : 'https://api.example.com/v1'}
            helperText={t('Preference.BaseURLHelp')}
          />
        )}

        <TextField
          label={t('Preference.APIKey')}
          value={formData.apiKey}
          onChange={(e) => handleChange('apiKey', e.target.value)}
          fullWidth
          margin='normal'
          type='password'
          placeholder='sk-...'
          helperText={t('Preference.APIKeyHelp')}
        />

        <FormControlLabel
          control={
            <Switch
              checked={formData.enabled}
              onChange={(e) => handleChange('enabled', e.target.checked)}
            />
          }
          label={t('Preference.EnableProvider')}
          sx={{ mt: 2 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          {t('Preference.Cancel')}
        </Button>
        <Button
          onClick={handleSubmit}
          variant='contained'
          disabled={saving || !formData.provider.trim()}
        >
          {saving ? t('Preference.Saving') : t('Preference.Save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
