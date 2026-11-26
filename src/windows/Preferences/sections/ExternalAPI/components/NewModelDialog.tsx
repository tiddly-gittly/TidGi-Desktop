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
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  useMediaQuery,
} from '@mui/material';
import { type AgentReasoningEffort, type ModelCatalogModel, normalizeProviderModelRoutes, PROVIDER_MODEL_ID_MAX_UTF8_BYTES, type ProviderModelRoute } from 'memeloop';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const REASONING_EFFORTS: readonly AgentReasoningEffort[] = [
  'minimal',
  'low',
  'medium',
  'high',
];

interface NewModelDialogProps {
  open: boolean;
  defaultApiMode?: ProviderModelRoute['apiMode'];
  route?: ProviderModelRoute;
  model?: ModelCatalogModel;
  onClose: () => void;
  onSave: (route: ProviderModelRoute, model: ModelCatalogModel) => void;
}

export function NewModelDialog({
  open,
  defaultApiMode = 'chat-completions',
  route,
  model,
  onClose,
  onSave,
}: NewModelDialogProps) {
  const { t } = useTranslation('agent');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [wireModelId, setWireModelId] = useState('');
  const [name, setName] = useState('');
  const [apiMode, setApiMode] = useState<ProviderModelRoute['apiMode']>('chat-completions');
  const [attachment, setAttachment] = useState(false);
  const [reasoning, setReasoning] = useState(false);
  const [toolCall, setToolCall] = useState(false);
  const [structuredOutput, setStructuredOutput] = useState(false);
  const [temperature, setTemperature] = useState(false);
  const [contextWindow, setContextWindow] = useState('');
  const [maxInputTokens, setMaxInputTokens] = useState('');
  const [maxOutputTokens, setMaxOutputTokens] = useState('');
  const [reasoningEfforts, setReasoningEfforts] = useState<
    AgentReasoningEffort[]
  >([]);
  const [inputModalities, setInputModalities] = useState('text');
  const [outputModalities, setOutputModalities] = useState('text');
  const [validationError, setValidationError] = useState<
    | 'wire-required'
    | 'wire-invalid'
    | 'context-invalid'
    | 'input-invalid'
    | 'output-invalid'
  >();
  const isNarrowScreen = useMediaQuery('(max-width:599.95px)');

  useEffect(() => {
    if (!open) return;
    setWireModelId(route?.wireModelId ?? '');
    setName(model?.name ?? '');
    setApiMode(route?.apiMode ?? defaultApiMode);
    setAdvancedOpen(false);
    setAttachment(model?.attachment ?? false);
    setReasoning(model?.reasoning ?? false);
    setToolCall(model?.toolCall ?? false);
    setStructuredOutput(model?.structuredOutput ?? false);
    setTemperature(model?.temperature ?? false);
    setContextWindow(stringifyLimit(model?.limit?.context));
    setMaxInputTokens(stringifyLimit(model?.limit?.input));
    setMaxOutputTokens(stringifyLimit(model?.limit?.output));
    setReasoningEfforts(
      model?.reasoningEfforts ? [...model.reasoningEfforts] : [],
    );
    setInputModalities((model?.modalities?.input ?? ['text']).join(', '));
    setOutputModalities((model?.modalities?.output ?? ['text']).join(', '));
    setValidationError(undefined);
  }, [defaultApiMode, model, open, route]);

  const save = () => {
    const wireId = wireModelId.trim();
    if (!wireId) {
      setValidationError('wire-required');
      return;
    }
    if (!isValidModelIdentifier(wireId)) {
      setValidationError('wire-invalid');
      return;
    }
    // Existing conversations reference this identity; editing the provider ID must not rename it.
    const logicalId = route?.modelId ?? wireId;
    const context = parseOptionalPositiveInteger(contextWindow);
    if (context === undefined && contextWindow.trim() !== '') {
      setAdvancedOpen(true);
      setValidationError('context-invalid');
      return;
    }
    const input = parseOptionalPositiveInteger(maxInputTokens);
    if (input === undefined && maxInputTokens.trim() !== '') {
      setAdvancedOpen(true);
      setValidationError('input-invalid');
      return;
    }
    const output = parseOptionalPositiveInteger(maxOutputTokens);
    if (output === undefined && maxOutputTokens.trim() !== '') {
      setAdvancedOpen(true);
      setValidationError('output-invalid');
      return;
    }
    setValidationError(undefined);
    const {
      limit: _previousLimit,
      reasoningEfforts: _previousReasoningEfforts,
      ...preservedMetadata
    } = model ?? {};
    const limit = {
      ...(context === undefined ? {} : { context }),
      ...(input === undefined ? {} : { input }),
      ...(output === undefined ? {} : { output }),
    };
    onSave(
      { modelId: logicalId, wireModelId: wireId, apiMode },
      {
        ...preservedMetadata,
        id: logicalId,
        name: name.trim() || wireId,
        attachment,
        reasoning,
        toolCall,
        ...(model?.structuredOutput !== undefined || structuredOutput
          ? { structuredOutput }
          : {}),
        ...(model?.temperature !== undefined || temperature
          ? { temperature }
          : {}),
        ...(reasoningEfforts.length > 0 ? { reasoningEfforts } : {}),
        modalities: {
          input: parseModalities(inputModalities),
          output: parseModalities(outputModalities),
        },
        ...(Object.keys(limit).length > 0 ? { limit } : {}),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth='sm'
      fullScreen={isNarrowScreen}
    >
      <DialogTitle>
        {route ? t('Preference.EditModel') : t('Preference.AddNewModel')}
      </DialogTitle>
      <DialogContent sx={{ overflowX: 'hidden' }}>
        <TextField
          fullWidth
          margin='normal'
          autoFocus
          label={t('Preference.WireModelId')}
          value={wireModelId}
          slotProps={{ htmlInput: { 'data-testid': 'new-model-name-input' } }}
          error={validationError === 'wire-required' || validationError === 'wire-invalid'}
          onChange={(event) => {
            setWireModelId(event.target.value);
            setValidationError(undefined);
          }}
          helperText={validationError === 'wire-required'
            ? t('Preference.ProviderModelIdRequired')
            : validationError === 'wire-invalid'
            ? t('Preference.ModelIdInvalid', {
              maxBytes: PROVIDER_MODEL_ID_MAX_UTF8_BYTES,
            })
            : t('Preference.WireModelIdDescription')}
        />
        <TextField
          fullWidth
          margin='normal'
          label={t('Preference.ModelCaption')}
          helperText={t('Preference.ModelCaptionHelp')}
          slotProps={{ htmlInput: { 'data-testid': 'new-model-display-name-input' } }}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        <Box
          component='details'
          open={advancedOpen}
          onToggle={event => {
            setAdvancedOpen(event.currentTarget.open);
          }}
          sx={{ mt: 2 }}
        >
          <Box component='summary' data-testid='model-advanced-toggle' sx={{ cursor: 'pointer', py: 1 }}>{t('Preference.ModelAdvanced')}</Box>
          <FormControl fullWidth margin='normal'>
            <InputLabel id='model-api-mode-label'>
              {t('Preference.APIMode')}
            </InputLabel>
            <Select
              labelId='model-api-mode-label'
              value={apiMode}
              label={t('Preference.APIMode')}
              onChange={(event) => {
                const value = event.target.value;
                if (value === 'chat-completions' || value === 'responses') {
                  setApiMode(value);
                }
              }}
            >
              <MenuItem value='chat-completions'>
                {t('Preference.ChatCompletionsAPIMode')}
              </MenuItem>
              <MenuItem value='responses'>
                {t('Preference.ResponsesAPIMode')}
              </MenuItem>
            </Select>
          </FormControl>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: 'minmax(0, 1fr)',
                sm: 'repeat(2, minmax(0, 1fr))',
              },
              gap: { xs: 0, sm: 2 },
            }}
          >
            <TextField
              fullWidth
              margin='normal'
              label={t('Preference.ContextWindow')}
              type='number'
              value={contextWindow}
              error={validationError === 'context-invalid'}
              helperText={validationError === 'context-invalid'
                ? t('Preference.PositiveIntegerRequired')
                : t('Preference.ContextWindowDescription')}
              onChange={(event) => {
                setContextWindow(event.target.value);
                setValidationError(undefined);
              }}
              slotProps={{
                htmlInput: {
                  min: 1,
                  step: 1,
                  'data-testid': 'model-context-window-input',
                },
              }}
            />
            <TextField
              fullWidth
              margin='normal'
              label={t('Preference.MaxInputTokens')}
              type='number'
              value={maxInputTokens}
              error={validationError === 'input-invalid'}
              helperText={validationError === 'input-invalid'
                ? t('Preference.PositiveIntegerRequired')
                : t('Preference.MaxInputTokensDescription')}
              onChange={(event) => {
                setMaxInputTokens(event.target.value);
                setValidationError(undefined);
              }}
              slotProps={{
                htmlInput: {
                  min: 1,
                  step: 1,
                  'data-testid': 'model-max-input-input',
                },
              }}
            />
            <TextField
              fullWidth
              margin='normal'
              label={t('Preference.MaxOutputTokens')}
              type='number'
              value={maxOutputTokens}
              error={validationError === 'output-invalid'}
              helperText={validationError === 'output-invalid'
                ? t('Preference.PositiveIntegerRequired')
                : t('Preference.MaxOutputTokensDescription')}
              onChange={(event) => {
                setMaxOutputTokens(event.target.value);
                setValidationError(undefined);
              }}
              slotProps={{
                htmlInput: {
                  min: 1,
                  step: 1,
                  'data-testid': 'model-max-output-input',
                },
              }}
            />
            <Box />
            <TextField
              fullWidth
              margin='normal'
              label={t('Preference.InputModalities')}
              value={inputModalities}
              onChange={(event) => {
                setInputModalities(event.target.value);
              }}
              slotProps={{
                htmlInput: { 'data-testid': 'model-input-modalities-input' },
              }}
            />
            <TextField
              fullWidth
              margin='normal'
              label={t('Preference.OutputModalities')}
              value={outputModalities}
              onChange={(event) => {
                setOutputModalities(event.target.value);
              }}
              slotProps={{
                htmlInput: { 'data-testid': 'model-output-modalities-input' },
              }}
            />
          </Box>
          <FormControl component='fieldset' fullWidth margin='normal'>
            <FormHelperText
              component='legend'
              sx={{ m: 0, mb: 0.5, fontSize: 'inherit', color: 'text.primary' }}
            >
              {t('Preference.SupportedReasoningEffort')}
            </FormHelperText>
            <FormGroup row sx={{ columnGap: 1, flexWrap: 'wrap' }}>
              {REASONING_EFFORTS.map((effort) => (
                <FormControlLabel
                  key={effort}
                  control={
                    <Checkbox
                      checked={reasoningEfforts.includes(effort)}
                      onChange={(event) => {
                        setReasoningEfforts((current) =>
                          event.target.checked
                            ? [...current, effort]
                            : current.filter((value) => value !== effort)
                        );
                      }}
                    />
                  }
                  label={t(`Preference.ReasoningEffort${capitalize(effort)}`)}
                />
              ))}
            </FormGroup>
          </FormControl>
          <FormGroup row sx={{ columnGap: 1, flexWrap: 'wrap' }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={attachment}
                  onChange={(event) => {
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
                  onChange={(event) => {
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
                  onChange={(event) => {
                    setToolCall(event.target.checked);
                  }}
                />
              }
              label={t('Preference.ToolCalling')}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={structuredOutput}
                  onChange={(event) => {
                    setStructuredOutput(event.target.checked);
                  }}
                />
              }
              label={t('Preference.StructuredOutput')}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={temperature}
                  onChange={(event) => {
                    setTemperature(event.target.checked);
                  }}
                />
              }
              label={t('Preference.TemperatureSupport')}
            />
          </FormGroup>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button
          onClick={save}
          variant='contained'
          data-testid='save-new-model-button'
        >
          {t('Save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function parseModalities(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function stringifyLimit(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

function parseOptionalPositiveInteger(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

function capitalize(value: string): string {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

/**
 * Keep model route identifiers aligned with Core's canonical schema.  Unlike
 * provider IDs, model IDs intentionally allow provider-specific Unicode and
 * punctuation (for example `供应商/模型2:latest`), but reject surrounding
 * whitespace/control characters and over-budget values.
 */
function isValidModelIdentifier(value: string): boolean {
  try {
    normalizeProviderModelRoutes([
      {
        modelId: value,
        wireModelId: value,
        apiMode: 'chat-completions',
      },
    ]);
    return true;
  } catch {
    return false;
  }
}
