import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormGroup,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import defaultProvidersConfig from '@services/externalAPI/defaultProviders.json';
import { ModelFeature, ModelInfo } from '@services/externalAPI/interface';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { NewModelFormState } from '../types';

interface ModelDialogProps {
  open: boolean;
  onClose: () => void;
  onAddModel: () => void;
  currentProvider: string;
  newModelForm: NewModelFormState;
  availableDefaultModels: ModelInfo[];
  selectedDefaultModel: string;
  onSelectDefaultModel: (model: string) => void;
  onModelFormChange: (field: keyof NewModelFormState, value: string | ModelFeature[]) => void;
  onFeatureChange: (feature: ModelFeature, checked: boolean) => void;
}

export function ModelDialog({
  open,
  onClose,
  onAddModel,
  currentProvider,
  newModelForm,
  availableDefaultModels,
  selectedDefaultModel,
  onSelectDefaultModel,
  onModelFormChange,
  onFeatureChange,
}: ModelDialogProps) {
  const { t } = useTranslation('agent');

  // When a preset model is selected, fill in its details to the form
  useEffect(() => {
    if (selectedDefaultModel) {
      const selectedModel = availableDefaultModels.find(m => m.name === selectedDefaultModel);
      if (selectedModel) {
        onModelFormChange('name', selectedModel.name);
        onModelFormChange('caption', selectedModel.caption || '');
        onModelFormChange('features', selectedModel.features || ['language']);
      }
    }
  }, [selectedDefaultModel, availableDefaultModels, onModelFormChange]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>{t('Preference.AddNewModel')}</DialogTitle>
      <DialogContent>
        {currentProvider && (
          <>
            {availableDefaultModels.length > 0 && (
              <Box sx={{ mb: 3, mt: 1 }}>
                <Typography variant='subtitle2' gutterBottom>
                  {t('Preference.SelectFromPresets')}
                </Typography>

                <FormControl fullWidth margin='dense'>
                  <InputLabel>{t('Preference.PresetModels')}</InputLabel>
                  <Select
                    value={selectedDefaultModel}
                    onChange={(event) => {
                      onSelectDefaultModel(event.target.value);
                    }}
                    label={t('Preference.PresetModels')}
                  >
                    <MenuItem value=''>{t('Preference.NoPresetSelected')}</MenuItem>
                    {availableDefaultModels.map((model) => (
                      <MenuItem key={model.name} value={model.name}>
                        {model.caption || model.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            )}

            <Box sx={{ mt: 2 }}>
              <Typography variant='subtitle2' gutterBottom>
                {t('Preference.ModelDetails')}
              </Typography>

              <TextField
                label={t('Preference.ModelName')}
                value={newModelForm.name}
                onChange={(event) => {
                  onModelFormChange('name', event.target.value);
                }}
                fullWidth
                margin='normal'
              />

              <TextField
                label={t('Preference.ModelCaption')}
                value={newModelForm.caption}
                onChange={(event) => {
                  onModelFormChange('caption', event.target.value);
                }}
                fullWidth
                margin='normal'
                helperText={t('Preference.ModelCaptionHelp')}
              />

              <Typography variant='subtitle2' sx={{ mt: 2, mb: 1 }}>
                {t('Preference.ModelFeatures')}
              </Typography>

              <FormGroup>
                {defaultProvidersConfig.modelFeatures.map((feature) => (
                  <FormControlLabel
                    key={feature.value}
                    control={
                      <Checkbox
                        checked={newModelForm.features.includes(feature.value as ModelFeature)}
                        onChange={(event) => {
                          onFeatureChange(feature.value as ModelFeature, event.target.checked);
                        }}
                      />
                    }
                    label={t(feature.i18nKey)}
                  />
                ))}
              </FormGroup>
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button onClick={onAddModel} variant='contained' color='primary'>
          {t('Add')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
