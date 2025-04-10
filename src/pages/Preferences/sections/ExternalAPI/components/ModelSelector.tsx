import { Autocomplete } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { TextField } from '../../../PreferenceComponents';
import { ModelOption } from '../types';

interface ModelSelectorProps {
  modelOptions: ModelOption[];
  selectedModelOption: ModelOption | null;
  onChange: (option: ModelOption | null) => void;
}

export function ModelSelector({ modelOptions, selectedModelOption, onChange }: ModelSelectorProps) {
  const { t } = useTranslation('agent');

  return (
    <Autocomplete
      value={selectedModelOption}
      onChange={(_, value) => {
        onChange(value);
      }}
      options={modelOptions}
      groupBy={(option) => option.provider}
      getOptionLabel={(option) => `${option.provider} - ${option.model}`}
      renderInput={(parameters) => (
        <TextField
          {...parameters}
          label={t('Preference.SelectModel')}
          variant='outlined'
          fullWidth
        />
      )}
      fullWidth
      style={{ marginTop: 16 }}
    />
  );
}
