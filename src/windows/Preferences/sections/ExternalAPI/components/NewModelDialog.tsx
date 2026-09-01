import { Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, InputLabel, MenuItem, Select, TextField } from '@mui/material';
import type { ModelCatalogModel, ProviderModelRoute } from 'memeloop';
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
  }, [model, open, route]);

  const save = () => {
    const logicalId = logicalModelId.trim();
    const wireId = wireModelId.trim() || logicalId;
    if (!logicalId || !wireId) return;
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
          onChange={event => {
            setLogicalModelId(event.target.value);
          }}
          slotProps={{ htmlInput: { 'data-testid': 'new-model-name-input' } }}
        />
        <TextField
          fullWidth
          margin='normal'
          label={t('Preference.WireModelId')}
          value={wireModelId}
          onChange={event => {
            setWireModelId(event.target.value);
          }}
          helperText={t('Preference.WireModelIdDescription')}
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
