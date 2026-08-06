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
import { ModelFeature, ModelInfo, ReasoningEffort } from '@services/externalAPI/interface';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ModelFeatureChip } from './ModelFeatureChip';

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
    apiMode?: ModelInfo['apiMode'];
    contextWindowSize?: number;
    maxOutputTokens?: number;
    modelOptions?: ModelInfo['modelOptions'];
    supportsReasoningEffort?: ReasoningEffort[];
    reasoningEffortFormat?: ModelInfo['reasoningEffortFormat'];
  };
  availableDefaultModels: ModelInfo[];
  selectedDefaultModel: string;
  onSelectDefaultModel: (model: string) => void;
  onModelFormChange: (field: string, value: unknown) => void;
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
          onModelFormChange('features', selectedModel.features || ['language']);
          onModelFormChange('apiMode', selectedModel.apiMode || 'chat-completions');
          onModelFormChange('contextWindowSize', selectedModel.contextWindowSize ?? selectedModel.maxInputTokens);
          onModelFormChange('maxOutputTokens', selectedModel.maxOutputTokens);
          onModelFormChange('modelOptions', selectedModel.modelOptions);
          onModelFormChange('supportsReasoningEffort', selectedModel.supportsReasoningEffort || []);
          onModelFormChange('reasoningEffortFormat', selectedModel.reasoningEffortFormat);
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
                    renderValue={(selected) => {
                      if (!selected) return t('Preference.NoPresetSelected', { ns: 'agent' });
                      const model = availableDefaultModels.find(m => m.name === selected);
                      if (model) return model.caption || model.name;
                      return selected;
                    }}
                  >
                    <MenuItem value=''>{t('Preference.NoPresetSelected', { ns: 'agent' })}</MenuItem>
                    {availableDefaultModels.map((model) => (
                      <MenuItem key={model.name} value={model.name} sx={{ py: 1 }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 0.5 }}>
                          <Typography variant='body1'>
                            {model.caption || model.name}
                          </Typography>
                          {model.features && model.features.length > 0 && (
                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                              {model.features.map(feature => <ModelFeatureChip key={feature} feature={feature} />)}
                            </Box>
                          )}
                        </Box>
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

              {(providerClass === 'openAICompatible' || providerClass === 'openai') && (
                <FormControl fullWidth margin='normal'>
                  <InputLabel>OpenAI API mode</InputLabel>
                  <Select
                    value={newModelForm.apiMode ?? 'chat-completions'}
                    label='OpenAI API mode'
                    onChange={(event) => {
                      onModelFormChange('apiMode', event.target.value);
                    }}
                  >
                    <MenuItem value='chat-completions'>Chat Completions</MenuItem>
                    <MenuItem value='responses'>Responses</MenuItem>
                  </Select>
                </FormControl>
              )}

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

              <TextField
                label='Context window / max input tokens'
                type='number'
                value={newModelForm.contextWindowSize ?? ''}
                onChange={(event) => {
                  onModelFormChange('contextWindowSize', event.target.value === '' ? undefined : Number(event.target.value));
                }}
                error={newModelForm.contextWindowSize !== undefined && (!Number.isInteger(newModelForm.contextWindowSize) || newModelForm.contextWindowSize <= 0)}
                helperText='Positive integer token limit for model input context.'
                fullWidth
                margin='normal'
                slotProps={{ htmlInput: { min: 1, step: 1, 'data-testid': 'model-context-window-input' } }}
              />

              <TextField
                label='Max output tokens'
                type='number'
                value={newModelForm.maxOutputTokens ?? ''}
                onChange={(event) => {
                  onModelFormChange('maxOutputTokens', event.target.value === '' ? undefined : Number(event.target.value));
                }}
                error={newModelForm.maxOutputTokens !== undefined && (!Number.isInteger(newModelForm.maxOutputTokens) || newModelForm.maxOutputTokens <= 0)}
                helperText='Positive integer default; an explicit request limit takes precedence.'
                fullWidth
                margin='normal'
                slotProps={{ htmlInput: { min: 1, step: 1, 'data-testid': 'model-max-output-input' } }}
              />

              <TextField
                label='Default top_p'
                type='number'
                value={newModelForm.modelOptions?.top_p ?? ''}
                onChange={(event) => {
                  onModelFormChange('modelOptions', {
                    ...(newModelForm.modelOptions || {}),
                    top_p: event.target.value === '' ? undefined : Number(event.target.value),
                  });
                }}
                error={newModelForm.modelOptions?.top_p !== undefined &&
                  (!Number.isFinite(newModelForm.modelOptions.top_p) || newModelForm.modelOptions.top_p < 0 || newModelForm.modelOptions.top_p > 1)}
                helperText='Number from 0 to 1; request-level topP takes precedence.'
                fullWidth
                margin='normal'
                slotProps={{ htmlInput: { min: 0, max: 1, step: 0.01, 'data-testid': 'model-top-p-input' } }}
              />

              <Typography variant='subtitle2' sx={{ mt: 2, mb: 1 }}>
                Supported reasoning effort
              </Typography>
              <FormGroup row>
                {(['minimal', 'low', 'medium', 'high'] as ReasoningEffort[]).map(effort => (
                  <FormControlLabel
                    key={effort}
                    control={
                      <Checkbox
                        checked={newModelForm.supportsReasoningEffort?.includes(effort) ?? false}
                        onChange={(event) => {
                          const current = newModelForm.supportsReasoningEffort || [];
                          onModelFormChange(
                            'supportsReasoningEffort',
                            event.target.checked ? [...current, effort] : current.filter(value => value !== effort),
                          );
                        }}
                      />
                    }
                    label={effort}
                  />
                ))}
              </FormGroup>

              <FormControl fullWidth margin='normal'>
                <InputLabel>Reasoning effort format</InputLabel>
                <Select
                  value={newModelForm.reasoningEffortFormat ?? ''}
                  label='Reasoning effort format'
                  onChange={(event) => {
                    onModelFormChange('reasoningEffortFormat', event.target.value || undefined);
                  }}
                  inputProps={{ 'data-testid': 'reasoning-effort-format-select' }}
                >
                  <MenuItem value=''>
                    <em>None</em>
                  </MenuItem>
                  <MenuItem value='chat-completions'>Chat Completions (reasoning_effort)</MenuItem>
                </Select>
              </FormControl>

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
                      value={(newModelForm.parameters?.workflowPath) || ''}
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
        <Button
          onClick={onAddModel}
          variant='contained'
          color='primary'
          data-testid='save-model-button'
          disabled={(newModelForm.contextWindowSize !== undefined && (!Number.isInteger(newModelForm.contextWindowSize) || newModelForm.contextWindowSize <= 0)) ||
            (newModelForm.maxOutputTokens !== undefined && (!Number.isInteger(newModelForm.maxOutputTokens) || newModelForm.maxOutputTokens <= 0)) ||
            (newModelForm.modelOptions?.top_p !== undefined &&
              (!Number.isFinite(newModelForm.modelOptions.top_p) || newModelForm.modelOptions.top_p < 0 || newModelForm.modelOptions.top_p > 1))}
        >
          {editMode ? t('Update') : t('Save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
