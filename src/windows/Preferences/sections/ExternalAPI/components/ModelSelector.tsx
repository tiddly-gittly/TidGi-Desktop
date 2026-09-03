import { Autocomplete, Box, Typography } from '@mui/material';
import type { AgentModelConfig, ModelCatalogModel, ProviderAccountConfig, ProviderModelRoute } from 'memeloop';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { hasUsableProviderCredentialReference } from '@services/externalAPI/providerCredentials';
import { TextField } from '../../../PreferenceComponents';
import { ModelFeatureChip } from './ModelFeatureChip';

interface ModelSelectorProps {
  selectedModel: AgentModelConfig | undefined;
  modelOptions: Array<
    readonly [
      ProviderAccountConfig,
      ProviderModelRoute,
      ModelCatalogModel | undefined,
    ]
  >;
  onChange: (selection: AgentModelConfig) => void;
  onClear?: () => void;
}

export function ModelSelector({ selectedModel, modelOptions, onChange, onClear }: ModelSelectorProps) {
  const { t } = useTranslation('agent');
  const selectedValue = selectedModel
    ? modelOptions.find(([account, route]) => account.providerId === selectedModel.providerId && route.modelId === selectedModel.modelId) ?? null
    : null;
  const filteredModelOptions = modelOptions.filter(([account]) => account.enabled !== false && hasUsableProviderCredentialReference(account));

  return (
    <Autocomplete
      value={selectedValue}
      onChange={(_, value) => {
        if (value) {
          onChange({ providerId: value[0].providerId, modelId: value[1].modelId });
        } else {
          onClear?.();
        }
      }}
      options={filteredModelOptions}
      groupBy={([account]) => account.catalogProvider?.name ?? account.providerId}
      getOptionLabel={([, route, model]) => model?.name ?? route.modelId}
      renderOption={({ key: _key, ...props }, [, route, model]) => (
        <li {...props}>
          <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            <Typography variant='body1'>{model?.name ?? route.modelId}</Typography>
            {model && (
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                {catalogFeatureLabels(model).map(feature => <ModelFeatureChip key={feature} feature={feature} />)}
              </Box>
            )}
          </Box>
        </li>
      )}
      renderInput={(parameters) => <TextField {...parameters} label={t('Preference.SelectModel')} variant='outlined' fullWidth />}
      fullWidth
      sx={{ minWidth: 250 }}
    />
  );
}

function catalogFeatureLabels(model: ModelCatalogModel): string[] {
  const labels: string[] = [];
  const inputs = new Set(model.modalities?.input ?? []);
  const outputs = new Set(model.modalities?.output ?? []);
  if (inputs.has('text') && outputs.has('text')) labels.push('language');
  if (model.reasoning) labels.push('reasoning');
  if (model.toolCall) labels.push('toolCalling');
  if (inputs.has('image')) labels.push('vision');
  if (outputs.has('image')) labels.push('imageGeneration');
  if (outputs.has('audio')) labels.push('speech');
  if (inputs.has('audio') && outputs.has('text')) labels.push('transcriptions');
  if (/embed/i.test(model.id) || /embed/i.test(model.name)) labels.push('embedding');
  return labels;
}
