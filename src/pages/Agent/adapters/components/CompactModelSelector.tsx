// Downward-expanding model picker with name preview, placed in the bottom toolbar.
// Uses MUI Popper so the menu automatically flips when bottom space is insufficient.

import { useAIConfigManagement } from '@/windows/Preferences/sections/ExternalAPI/useAIConfigManagement';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import SwitchCameraIcon from '@mui/icons-material/SwitchCamera';
import { Autocomplete, Box, ClickAwayListener, Paper, Popper, TextField, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import type { AgentModelConfig, ProviderAccountConfig, ProviderModelRoute } from 'memeloop';
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

export const CompactModelSelector: React.FC<ModelSelectorProps> = ({ agentId, agentDefId }) => {
  const { t } = useTranslation('agent');
  const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorElement);
  const searchInputReference = useRef<HTMLInputElement>(null);
  const { accounts, config, handleModelChange } = useAIConfigManagement({
    agentId,
    agentDefId,
  });

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
          ...(config?.default?.parameters === undefined ? {} : { parameters: config.default.parameters }),
        },
      });
    }
  }

  const selectedModel = config?.default
    ? modelOptions.find(option => option.value.providerId === config.default?.providerId && option.value.modelId === config.default?.modelId)
    : undefined;

  const displayName = selectedModel
    ? modelDisplayName(selectedModel)
    : (config?.default
      ? `${config.default.providerId} - ${config.default.modelId}`
      : t('ModelSelector.NoModelSelected'));

  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorElement((previous) => (previous ? null : event.currentTarget));
  }, []);

  const handleClose = useCallback(() => {
    setAnchorElement(null);
  }, []);

  const handleSelect = useCallback(
    async (option: ModelOption | null) => {
      if (!option) return;
      await handleModelChange(option.value);
      handleClose();
    },
    [handleModelChange, handleClose],
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
                void handleSelect(value);
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
    </>
  );
};
