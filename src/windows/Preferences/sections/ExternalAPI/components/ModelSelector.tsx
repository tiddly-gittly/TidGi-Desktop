import { Autocomplete } from '@mui/material';
import { AiAPIConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { AIProviderConfig, ModelInfo } from '@services/externalAPI/interface';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { TextField } from '../../../PreferenceComponents';

interface ModelSelectorProps {
  selectedConfig: AiAPIConfig | null;
  modelOptions: Array<[AIProviderConfig, ModelInfo]>;
  onChange: (provider: string, model: string) => void;
  onClear?: () => void;
  onlyShowEnabled?: boolean;
}

export function ModelSelector({ selectedConfig, modelOptions, onChange, onClear, onlyShowEnabled }: ModelSelectorProps) {
  const { t } = useTranslation('agent');
  const selectedValue = selectedConfig && selectedConfig.api.model && selectedConfig.api.provider &&
      selectedConfig.api.model !== '' && selectedConfig.api.provider !== ''
    ? modelOptions.find(m => m[0].provider === selectedConfig.api.provider && m[1].name === selectedConfig.api.model) || null
    : null;
  const filteredModelOptions = onlyShowEnabled
    ? modelOptions.filter(m => m[0].enabled)
    : modelOptions;
  return (
    <Autocomplete
      value={selectedValue}
      onChange={(_, value) => {
        if (value) {
          onChange(value[0].provider, value[1].name);
        } else if (onClear) {
          onClear();
        }
      }}
      options={filteredModelOptions}
      groupBy={(option) => option[0].provider}
      getOptionLabel={(option) => option[1].name}
      renderInput={(parameters) => (
        <TextField
          {...parameters}
          label={t('Preference.SelectModel')}
          variant='outlined'
          fullWidth
        />
      )}
      fullWidth
      sx={{ minWidth: 250 }}
    />
  );
}
