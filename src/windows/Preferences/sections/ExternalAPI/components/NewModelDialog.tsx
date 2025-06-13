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
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface ModelDialogProps {
  open: boolean;
  onClose: () => void;
  onAddModel: () => void;
  currentProvider: string | null;
  newModelForm: {
    name: string;
    caption: string;
    features: ModelFeature[];
  };
  availableDefaultModels: ModelInfo[];
  selectedDefaultModel: string;
  onSelectDefaultModel: (model: string) => void;
  onModelFormChange: (field: string, value: string | ModelFeature[]) => void;
  onFeatureChange: (feature: ModelFeature, checked: boolean) => void;
}

export function NewModelDialog({
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
  const { t } = useTranslation(['translation', 'agent']);
  const lastSelectedModelReference = useRef<string | null>(null);

  // When a preset model is selected, fill in its details to the form
  useEffect(() => {
    // 只有当选择的模型与上次不同时才进行更新
    if (selectedDefaultModel !== lastSelectedModelReference.current) {
      lastSelectedModelReference.current = selectedDefaultModel;

      if (selectedDefaultModel) {
        const selectedModel = availableDefaultModels.find(m => m.name === selectedDefaultModel);
        if (selectedModel) {
          onModelFormChange('name', selectedModel.name);
          onModelFormChange('caption', selectedModel.caption || '');
          onModelFormChange('features', selectedModel.features || ['language' as ModelFeature]);
        }
      }
    }
  }, [selectedDefaultModel, availableDefaultModels, onModelFormChange]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>{t('Preference.AddNewModel', { ns: 'agent' })}</DialogTitle>
      <DialogContent>
        {currentProvider && (
          <>
            {availableDefaultModels.length > 0 && (
              <Box sx={{ mb: 3, mt: 1 }}>
                <Typography variant='subtitle2' gutterBottom>
                  {t('Preference.SelectFromPresets', { ns: 'agent' })}
                </Typography>

                <FormControl fullWidth margin='dense'>
                  <InputLabel>{t('Preference.PresetModels', { ns: 'agent' })}</InputLabel>
                  <Select
                    value={selectedDefaultModel}
                    onChange={(event) => {
                      onSelectDefaultModel(event.target.value);
                    }}
                    label={t('Preference.PresetModels', { ns: 'agent' })}
                  >
                    <MenuItem value=''>{t('Preference.NoPresetSelected', { ns: 'agent' })}</MenuItem>
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
                {t('Preference.ModelDetails', { ns: 'agent' })}
              </Typography>

              <TextField
                label={t('Preference.ModelName', { ns: 'agent' })}
                value={newModelForm.name}
                onChange={(event) => {
                  onModelFormChange('name', event.target.value);
                }}
                fullWidth
                margin='normal'
              />

              <TextField
                label={t('Preference.ModelCaption', { ns: 'agent' })}
                value={newModelForm.caption}
                onChange={(event) => {
                  onModelFormChange('caption', event.target.value);
                }}
                fullWidth
                margin='normal'
                helperText={t('Preference.ModelCaptionHelp', { ns: 'agent' })}
              />

              <Typography variant='subtitle2' sx={{ mt: 2, mb: 1 }}>
                {t('Preference.ModelFeatures', { ns: 'agent' })}
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
                    label={t(feature.i18nKey, { ns: 'agent' })}
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
          {t('Save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
