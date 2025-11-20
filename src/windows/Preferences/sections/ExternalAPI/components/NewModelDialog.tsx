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
import defaultProvidersConfig from '@services/externalAPI/defaultProviders';
import { ModelFeature, ModelInfo } from '@services/externalAPI/interface';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface ModelDialogProps {
  open: boolean;
  onClose: () => void;
  onAddModel: () => void;
  currentProvider: string | null;
  providerClass?: string;
  newModelForm: {
    name: string;
    caption: string;
    features: ModelFeature[];
    parameters?: Record<string, unknown>;
  };
  availableDefaultModels: ModelInfo[];
  selectedDefaultModel: string;
  onSelectDefaultModel: (model: string) => void;
  onModelFormChange: (field: string, value: string | ModelFeature[] | Record<string, unknown>) => void;
  onFeatureChange: (feature: ModelFeature, checked: boolean) => void;
  editMode?: boolean;
}

export function NewModelDialog({
  open,
  onClose,
  onAddModel,
  currentProvider,
  providerClass,
  newModelForm,
  availableDefaultModels,
  selectedDefaultModel,
  onSelectDefaultModel,
  onModelFormChange,
  onFeatureChange,
  editMode = false,
}: ModelDialogProps) {
  const { t } = useTranslation(['translation', 'agent']);
  const lastSelectedModelReference = useRef<string | null>(null);

  // Handle workflow file selection for ComfyUI
  const handleSelectWorkflowFile = async () => {
    const result = await window.service.native.pickFile([{ name: 'JSON Files', extensions: ['json'] }]);

    if (result.length > 0) {
      const workflowPath = result[0];
      const parameters = { ...(newModelForm.parameters || {}), workflowPath };
      onModelFormChange('parameters', parameters);
    }
  };

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
                slotProps={{ htmlInput: { 'data-testid': 'new-model-name-input' } }}
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
                    data-testid={`feature-checkbox-${feature.value}`}
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

              {/* ComfyUI workflow path */}
              {providerClass === 'comfyui' && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant='subtitle2' gutterBottom>
                    {t('Preference.WorkflowFile', { ns: 'agent' })}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <TextField
                      label={t('Preference.WorkflowFilePath', { ns: 'agent' })}
                      value={(newModelForm.parameters?.workflowPath as string) || ''}
                      onChange={(event) => {
                        const parameters = { ...(newModelForm.parameters || {}), workflowPath: event.target.value };
                        onModelFormChange('parameters', parameters);
                      }}
                      fullWidth
                      margin='normal'
                      slotProps={{ htmlInput: { 'data-testid': 'workflow-path-input' } }}
                      helperText={t('Preference.WorkflowFileHelp', { ns: 'agent' })}
                    />
                    <Button
                      variant='outlined'
                      onClick={handleSelectWorkflowFile}
                      data-testid='select-workflow-button'
                      sx={{ mt: 1 }}
                    >
                      {t('Preference.Browse', { ns: 'agent' })}
                    </Button>
                  </Box>
                </Box>
              )}
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button onClick={onAddModel} variant='contained' color='primary' data-testid='save-model-button'>
          {editMode ? t('Update') : t('Save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
