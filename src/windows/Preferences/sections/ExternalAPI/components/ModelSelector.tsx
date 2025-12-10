import { Autocomplete } from '@mui/material';
import { ModelSelection } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { AIProviderConfig, ModelInfo } from '@services/externalAPI/interface';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { TextField } from '../../../PreferenceComponents';

interface ModelSelectorProps {
  selectedModel: ModelSelection | undefined;
  modelOptions: Array<[AIProviderConfig, ModelInfo]>;
  onChange: (provider: string, model: string) => void;
  onClear?: () => void;
  onlyShowEnabled?: boolean;
}

export function ModelSelector({ selectedModel, modelOptions, onChange, onClear, onlyShowEnabled }: ModelSelectorProps) {
  const { t } = useTranslation('agent');

  const selectedValue = selectedModel && selectedModel.model && selectedModel.provider &&
      selectedModel.model !== '' && selectedModel.provider !== ''
    ? modelOptions.find(m => m[0].provider === selectedModel.provider && m[1].name === selectedModel.model) || null
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
