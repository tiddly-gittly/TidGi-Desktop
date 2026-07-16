// Downward-expanding model picker with name preview, placed in the bottom toolbar.
// Uses MUI Popper so the menu automatically flips when bottom space is insufficient.

import { useAgentChatStore } from '@/pages/Agent/store/agentChatStore';
import { useAIConfigManagement } from '@/windows/Preferences/sections/ExternalAPI/useAIConfigManagement';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import SwitchCameraIcon from '@mui/icons-material/SwitchCamera';
import { Autocomplete, Box, ClickAwayListener, Paper, Popper, TextField, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import type { AIProviderConfig, ModelInfo } from '@services/externalAPI/interface';
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
  agentDefId?: string;
}

export const CompactModelSelector: React.FC<ModelSelectorProps> = ({ agentDefId }) => {
  const { t } = useTranslation('agent');
  const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorElement);
  const searchInputReference = useRef<HTMLInputElement>(null);
  const agent = useAgentChatStore((state) => state.agent);

  const { config, providers, handleModelChange } = useAIConfigManagement({
    agentId: agent?.id,
    agentDefId,
  });

  const modelOptions: Array<[AIProviderConfig, ModelInfo]> = [];
  for (const provider of providers) {
    if (provider.models) {
      for (const model of provider.models) {
        if ('name' in model) {
          modelOptions.push([provider, model]);
        }
      }
    }
  }

  const selectedModel = config?.default
    ? modelOptions.find((m) => m[0].provider === config.default?.provider && m[1].name === config.default?.model)
    : undefined;

  const displayName = selectedModel
    ? `${selectedModel[0].provider} - ${selectedModel[1].name}`
    : (config?.default
      ? `${config.default.provider} - ${config.default.model}`
      : t('ModelSelector.NoModelSelected'));

  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorElement((previous) => (previous ? null : event.currentTarget));
  }, []);

  const handleClose = useCallback(() => {
    setAnchorElement(null);
  }, []);

  const handleSelect = useCallback(
    async (option: [AIProviderConfig, ModelInfo] | null) => {
      if (!option) return;
      await handleModelChange(option[0].provider, option[1].name);
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
            <Autocomplete<[AIProviderConfig, ModelInfo], false, true>
              open
              autoHighlight
              size='small'
              options={modelOptions}
              getOptionLabel={(option) => `${option[0].provider} - ${option[1].name}`}
              value={selectedModel ?? (modelOptions[0]) ?? null}
              onChange={(_event, value) => {
                void handleSelect(value);
              }}
              filterOptions={(options, state) => {
                const query = state.inputValue.toLowerCase();
                if (!query) return options;
                return options.filter((o) =>
                  o[0].provider.toLowerCase().includes(query) ||
                  o[1].name.toLowerCase().includes(query) ||
                  (o[1].caption ?? '').toLowerCase().includes(query)
                );
              }}
              isOptionEqualToValue={(option, value) => option[0].provider === value[0].provider && option[1].name === value[1].name}
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
                  key={`${option[0].provider}-${option[1].name}`}
                  data-testid={`model-selector-option-${option[0].provider}-${option[1].name}`}
                  sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start !important', py: 0.5 }}
                >
                  <Typography variant='body2' sx={{ fontWeight: option === selectedModel ? 600 : 400 }}>
                    {option[0].provider} - {option[1].name}
                  </Typography>
                  {option[1].caption && (
                    <Typography variant='caption' noWrap sx={{ color: 'text.secondary', maxWidth: '100%' }}>
                      {option[1].caption}
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
