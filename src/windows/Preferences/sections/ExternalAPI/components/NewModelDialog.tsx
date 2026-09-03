import { Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, InputLabel, MenuItem, Select, TextField } from '@mui/material';
import { type ModelCatalogModel, normalizeProviderModelRoutes, PROVIDER_MODEL_ID_MAX_UTF8_BYTES, type ProviderModelRoute } from 'memeloop';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface NewModelDialogProps {
  open: boolean;
  route?: ProviderModelRoute;
  model?: ModelCatalogModel;
  onClose: () => void;
  onSave: (route: ProviderModelRoute, model: ModelCatalogModel) => void;
}

export function NewModelDialog({ open, route, model, onClose, onSave }: NewModelDialogProps) {
  const { t } = useTranslation('agent');
  const [logicalModelId, setLogicalModelId] = useState('');
  const [wireModelId, setWireModelId] = useState('');
  const [name, setName] = useState('');
  const [apiMode, setApiMode] = useState<ProviderModelRoute['apiMode']>('chat-completions');
  const [attachment, setAttachment] = useState(false);
  const [reasoning, setReasoning] = useState(false);
  const [toolCall, setToolCall] = useState(false);
  const [inputModalities, setInputModalities] = useState('text');
  const [outputModalities, setOutputModalities] = useState('text');
  const [validationError, setValidationError] = useState<'logical-required' | 'logical-invalid' | 'wire-invalid'>();

  useEffect(() => {
    if (!open) return;
    setLogicalModelId(route?.modelId ?? '');
    setWireModelId(route?.wireModelId ?? '');
    setName(model?.name ?? '');
    setApiMode(route?.apiMode ?? 'chat-completions');
    setAttachment(model?.attachment ?? false);
    setReasoning(model?.reasoning ?? false);
    setToolCall(model?.toolCall ?? false);
    setInputModalities((model?.modalities?.input ?? ['text']).join(', '));
    setOutputModalities((model?.modalities?.output ?? ['text']).join(', '));
    setValidationError(undefined);
  }, [model, open, route]);

  const save = () => {
    const logicalId = logicalModelId.trim();
    if (!logicalId) {
      setValidationError('logical-required');
      return;
    }
    if (!isValidModelIdentifier(logicalId)) {
      setValidationError('logical-invalid');
      return;
    }
    const wireId = wireModelId.trim() || logicalId;
    if (!isValidModelIdentifier(wireId)) {
      setValidationError('wire-invalid');
      return;
    }
    setValidationError(undefined);
    onSave(
      { modelId: logicalId, wireModelId: wireId, apiMode },
      {
        id: logicalId,
        name: name.trim() || logicalId,
        attachment,
        reasoning,
        toolCall,
        modalities: {
          input: parseModalities(inputModalities),
          output: parseModalities(outputModalities),
        },
      },
    );
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth='sm'>
      <DialogTitle>{route ? t('Preference.EditModel') : t('Preference.AddNewModel')}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          margin='normal'
          label={t('Preference.LogicalModelId')}
          value={logicalModelId}
          error={validationError === 'logical-required' || validationError === 'logical-invalid'}
          helperText={validationError === 'logical-required'
            ? t('Preference.ModelNameRequired')
            : validationError === 'logical-invalid'
            ? t('Preference.ModelIdInvalid', { maxBytes: PROVIDER_MODEL_ID_MAX_UTF8_BYTES })
            : undefined}
          onChange={event => {
            setLogicalModelId(event.target.value);
            setValidationError(undefined);
          }}
          slotProps={{ htmlInput: { 'data-testid': 'new-model-name-input' } }}
        />
        <TextField
          fullWidth
          margin='normal'
          label={t('Preference.WireModelId')}
          value={wireModelId}
          error={validationError === 'wire-invalid'}
          onChange={event => {
            setWireModelId(event.target.value);
            setValidationError(undefined);
          }}
          helperText={validationError === 'wire-invalid'
            ? t('Preference.ModelIdInvalid', { maxBytes: PROVIDER_MODEL_ID_MAX_UTF8_BYTES })
            : t('Preference.WireModelIdDescription')}
        />
        <TextField
          fullWidth
          margin='normal'
          label={t('Preference.ModelCaption')}
          value={name}
          onChange={event => {
            setName(event.target.value);
          }}
        />
        <FormControl fullWidth margin='normal'>
          <InputLabel id='model-api-mode-label'>{t('Preference.APIMode')}</InputLabel>
          <Select
            labelId='model-api-mode-label'
            value={apiMode}
            label={t('Preference.APIMode')}
            onChange={event => {
              const value = event.target.value;
              if (value === 'chat-completions' || value === 'responses') setApiMode(value);
            }}
          >
            <MenuItem value='chat-completions'>{t('Preference.ChatCompletionsAPIMode')}</MenuItem>
            <MenuItem value='responses'>{t('Preference.ResponsesAPIMode')}</MenuItem>
          </Select>
        </FormControl>
        <TextField
          fullWidth
          margin='normal'
          label={t('Preference.InputModalities')}
          value={inputModalities}
          onChange={event => {
            setInputModalities(event.target.value);
          }}
        />
        <TextField
          fullWidth
          margin='normal'
          label={t('Preference.OutputModalities')}
          value={outputModalities}
          onChange={event => {
            setOutputModalities(event.target.value);
          }}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={attachment}
              onChange={event => {
                setAttachment(event.target.checked);
              }}
            />
          }
          label={t('Preference.Attachments')}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={reasoning}
              onChange={event => {
                setReasoning(event.target.checked);
              }}
            />
          }
          label={t('Preference.Reasoning')}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={toolCall}
              onChange={event => {
                setToolCall(event.target.checked);
              }}
            />
          }
          label={t('Preference.ToolCalling')}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button onClick={save} variant='contained' data-testid='save-new-model-button'>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  );
}

function parseModalities(value: string): string[] {
  return [...new Set(value.split(',').map(item => item.trim()).filter(Boolean))];
}

/**
 * Keep model route identifiers aligned with Core's canonical schema.  Unlike
 * provider IDs, model IDs intentionally allow provider-specific Unicode and
 * punctuation (for example `供应商/模型2:latest`), but reject surrounding
 * whitespace/control characters and over-budget values.
 */
function isValidModelIdentifier(value: string): boolean {
  try {
    normalizeProviderModelRoutes([{
      modelId: value,
      wireModelId: value,
      apiMode: 'chat-completions',
    }]);
    return true;
  } catch {
    return false;
  }
}
