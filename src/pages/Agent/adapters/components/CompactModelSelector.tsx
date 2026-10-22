// Downward-expanding model picker with name preview, placed in the bottom toolbar.
// Uses MUI Popper so the menu automatically flips when bottom space is insufficient.

import { useAIConfigManagement } from '@/windows/Preferences/sections/ExternalAPI/useAIConfigManagement';
import { ModelParameterFields } from '@memeloop/react-ui/agent';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import SwitchCameraIcon from '@mui/icons-material/SwitchCamera';
import TuneIcon from '@mui/icons-material/Tune';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  ClickAwayListener,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Popper,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import type { AgentModelConfig, AgentModelParameters, ProviderAccountConfig, ProviderModelRoute } from 'memeloop';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const SwitcherButton = styled(Box)<{ disabled?: boolean }>(({ theme, disabled }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 10px 2px 6px',
  borderRadius: 12,
  cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.5 : 1,
  backgroundColor: theme.palette.action.hover,
  transition: 'background-color 0.15s',
  whiteSpace: 'nowrap',
  '&:hover': disabled
    ? {}
    : {
      backgroundColor: theme.palette.action.selected,
    },
}));

const DropdownPaper = styled(Paper)(({ theme }) => ({
  minWidth: 320,
  maxWidth: 480,
  borderRadius: 8,
  boxShadow: theme.shadows[8],
  padding: theme.spacing(1),
}));

interface ModelSelectorProps {
  agentId?: string;
  agentDefId?: string;
  showParameters?: boolean;
  disabled?: boolean;
}

interface ModelOption {
  /** Canonical value persisted unchanged when this option is selected. */
  value: AgentModelConfig;
  account: ProviderAccountConfig;
  route: ProviderModelRoute;
}

function modelDisplayName(option: ModelOption): string {
  const providerName = option.account.catalogProvider?.name ?? option.account.providerId;
  const modelName = option.account.catalogProvider?.models.find(model => model.id === option.route.modelId)?.name ?? option.route.modelId;
  return `${providerName} - ${modelName}`;
}

export const CompactModelSelector: React.FC<ModelSelectorProps> = ({ agentId, agentDefId, showParameters, disabled }) => {
  const { t } = useTranslation('agent');
  const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorElement);
  const searchInputReference = useRef<HTMLInputElement>(null);
  const [parametersOpen, setParametersOpen] = useState(false);
  const [parameters, setParameters] = useState<AgentModelParameters>({});
  const configManagement = useAIConfigManagement({
    agentId,
    agentDefId,
  });
  const { accounts, handleModelChange } = configManagement;
  const config = 'handleEmbeddingModelChange' in configManagement
    ? configManagement.config?.default
    : configManagement.config;
  const busy = disabled || configManagement.loading || configManagement.saving;
  const selectedCatalogModel = accounts.find(account => account.providerId === config?.providerId)?.catalogProvider?.models.find(model => model.id === config?.modelId);
  const parameterContext = `${agentId ?? ''}:${agentDefId ?? ''}:${config?.providerId ?? ''}:${config?.modelId ?? ''}`;
  const currentParameterContext = useRef(parameterContext);
  currentParameterContext.current = parameterContext;
  useEffect(() => {
    setParametersOpen(false);
  }, [parameterContext]);

  const modelOptions: ModelOption[] = [];
  for (const account of accounts) {
    if (account.enabled === false) continue;
    for (const route of account.models) {
      modelOptions.push({
        account,
        route,
        value: {
          providerId: account.providerId,
          modelId: route.modelId,
          ...(config?.parameters === undefined ? {} : { parameters: config.parameters }),
        },
      });
    }
  }

  const selectedModel = config
    ? modelOptions.find(option => option.value.providerId === config.providerId && option.value.modelId === config.modelId)
    : undefined;

  const displayName = selectedModel
    ? modelDisplayName(selectedModel)
    : (config
      ? `${config.providerId} - ${config.modelId}`
      : t('ModelSelector.NoModelSelected'));

  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (busy) return;
    setAnchorElement((previous) => (previous ? null : event.currentTarget));
  }, [busy]);

  const handleClose = useCallback(() => {
    setAnchorElement(null);
  }, []);

  const handleSelect = useCallback(
    async (option: ModelOption | null) => {
      if (!option || busy) return;
      await handleModelChange(option.value);
      handleClose();
    },
    [handleModelChange, handleClose, busy],
  );

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => searchInputReference.current?.focus(), 50);
    return () => {
      clearTimeout(timer);
    };
  }, [open]);

  return (
    <>
      <SwitcherButton
        disabled={busy}
        onClick={handleClick}
        data-testid='model-selector-button'
        title={displayName}
      >
        <SwitchCameraIcon sx={{ fontSize: 16 }} />
        <Typography variant='caption' sx={{ fontWeight: 500, lineHeight: 1.4 }}>
          {displayName}
        </Typography>
        <ArrowDropDownIcon sx={{ fontSize: 16, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </SwitcherButton>
      <Popper
        open={open}
        anchorEl={anchorElement}
        placement='bottom-start'
        style={{ zIndex: 1500 }}
        modifiers={[
          { name: 'offset', options: { offset: [0, 4] } },
          { name: 'flip', enabled: true },
          { name: 'preventOverflow', enabled: true },
        ]}
      >
        <ClickAwayListener onClickAway={handleClose}>
          <DropdownPaper data-testid='model-selector-dropdown'>
            <Autocomplete<ModelOption, false, true>
              open
              autoHighlight
              size='small'
              options={modelOptions}
              getOptionLabel={modelDisplayName}
              value={selectedModel ?? (modelOptions[0]) ?? null}
              onChange={(_event, value) => {
                void handleSelect(value).catch(() => undefined);
              }}
              filterOptions={(options, state) => {
                const query = state.inputValue.toLowerCase();
                if (!query) return options;
                return options.filter(option =>
                  [
                    option.account.providerId,
                    option.account.catalogProvider?.name,
                    option.route.modelId,
                    option.route.wireModelId,
                    option.account.catalogProvider?.models.find(model => model.id === option.route.modelId)?.name,
                  ].some(value => value?.toLowerCase().includes(query))
                );
              }}
              isOptionEqualToValue={(option, value) => option.value.providerId === value.value.providerId && option.value.modelId === value.value.modelId}
              renderInput={(parameters) => (
                <TextField
                  {...parameters}
                  inputRef={searchInputReference}
                  placeholder={t('ModelSelector.SelectModel')}
                  autoFocus
                  data-testid='model-selector-search'
                  sx={{ mb: 0.5 }}
                />
              )}
              renderOption={(props, option) => (
                <Box
                  component='li'
                  {...props}
                  key={`${option.value.providerId}-${option.value.modelId}`}
                  data-testid={`model-selector-option-${option.value.providerId}-${option.value.modelId}`}
                  sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start !important', py: 0.5 }}
                >
                  <Typography variant='body2' sx={{ fontWeight: option === selectedModel ? 600 : 400 }}>
                    {modelDisplayName(option)}
                  </Typography>
                  {option.route.wireModelId !== option.route.modelId && (
                    <Typography variant='caption' noWrap sx={{ color: 'text.secondary', maxWidth: '100%' }}>
                      {option.route.wireModelId}
                    </Typography>
                  )}
                </Box>
              )}
              slotProps={{
                paper: { sx: { boxShadow: 'none', border: 'none' } },
                listbox: { sx: { maxHeight: 280 }, 'data-testid': 'model-selector-listbox' } as React.HTMLAttributes<HTMLUListElement>,
              }}
              disablePortal
              disableClearable
            />
          </DropdownPaper>
        </ClickAwayListener>
      </Popper>
      {showParameters && (
        <>
          <Tooltip title={t('Preference.ModelParameters')}>
            <span>
              <IconButton
                size='small'
                aria-label={t('Preference.ModelParameters')}
                data-testid='conversation-model-parameters'
                disabled={busy || !config}
                onClick={() => {
                  configManagement.clearError?.();
                  setParameters({ ...config?.parameters });
                  setParametersOpen(true);
                }}
              >
                <TuneIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Dialog
            data-testid='conversation-model-parameters-dialog'
            open={parametersOpen}
            onClose={() => {
              if (!configManagement.saving) setParametersOpen(false);
            }}
            fullWidth
            maxWidth='xs'
          >
            <DialogTitle>{t('Preference.ModelParameters')} — {selectedCatalogModel?.name ?? config?.modelId}</DialogTitle>
            <DialogContent>
              {configManagement.error && <Alert severity='error'>{t('Preference.FailedToSaveModelParameters')}</Alert>}
              <Box sx={{ pt: 1 }}>
                <ModelParameterFields
                  model={selectedCatalogModel}
                  value={parameters}
                  onChange={setParameters}
                  disabled={busy}
                  labels={{
                    reasoningEffort: t('Preference.ReasoningEffort'),
                    temperature: t('Preference.Temperature'),
                    maxOutputTokens: t('Preference.MaxOutputTokens'),
                    defaultValue: t('Preference.ModelDefault'),
                    unavailable: t('Preference.NoModelParameters'),
                  }}
                />
              </Box>
            </DialogContent>
            <DialogActions>
              <Button
                disabled={configManagement.saving}
                onClick={() => {
                  setParametersOpen(false);
                }}
              >
                {t('Cancel', { ns: 'translation' })}
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  const context = parameterContext;
                  void configManagement.handleParametersChange(parameters).then(() => {
                    if (currentParameterContext.current === context) setParametersOpen(false);
                  }).catch(() => undefined);
                }}
              >
                {t('Save', { ns: 'translation' })}
              </Button>
            </DialogActions>
          </Dialog>
        </>
      )}
    </>
  );
};
