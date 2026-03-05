// Downward-expanding agent picker with autocomplete search, placed in the header bar

import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { Autocomplete, Box, ClickAwayListener, Paper, Popper, TextField, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import type { AgentDefinition } from '@services/agentDefinition/interface';
import React, { useCallback, useEffect, useRef, useState } from 'react';

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
  minWidth: 280,
  maxWidth: 420,
  borderRadius: 8,
  boxShadow: theme.shadows[8],
  padding: theme.spacing(1),
}));

interface AgentSwitcherProps {
  currentAgentDefId?: string;
  onSwitch: (agentDefinitionId: string) => void;
  disabled?: boolean;
}

export const AgentSwitcher: React.FC<AgentSwitcherProps> = ({ currentAgentDefId, onSwitch, disabled }) => {
  const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null);
  const [agentDefs, setAgentDefs] = useState<AgentDefinition[]>([]);
  const open = Boolean(anchorElement);
  const searchInputReference = useRef<HTMLInputElement>(null);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (disabled) return;
      setAnchorElement((previous) => (previous ? null : event.currentTarget));
    },
    [disabled],
  );

  const handleClose = useCallback(() => {
    setAnchorElement(null);
  }, []);

  const handleSelect = useCallback(
    (definition: AgentDefinition) => {
      if (definition.id && definition.id !== currentAgentDefId) {
        onSwitch(definition.id);
      }
      handleClose();
    },
    [currentAgentDefId, onSwitch, handleClose],
  );

  // Load agent definitions when dropdown opens
  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const defs = await window.service.agentDefinition.getAgentDefs();
        setAgentDefs(defs);
      } catch {
        // Silently fail — dropdown will just be empty
      }
    })();
  }, [open]);

  // Auto-focus search input when dropdown opens
  useEffect(() => {
    if (open) {
      // Small delay to let popper render
      const timer = setTimeout(() => {
        searchInputReference.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const currentDefinition = agentDefs.find((d) => d.id === currentAgentDefId);
  const displayName = currentDefinition?.name ?? currentAgentDefId ?? 'Agent';

  return (
    <>
      <SwitcherButton
        onClick={handleClick}
        disabled={disabled}
        data-testid='agent-switcher-button'
      >
        <SmartToyIcon sx={{ fontSize: 16 }} />
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
        modifiers={[{ name: 'offset', options: { offset: [0, 4] } }]}
      >
        <ClickAwayListener onClickAway={handleClose}>
          <DropdownPaper data-testid='agent-switcher-dropdown'>
            <Autocomplete<AgentDefinition, false, true>
              open
              autoHighlight
              size='small'
              options={agentDefs}
              getOptionLabel={(option) => option.name ?? option.id}
              value={currentDefinition ?? (agentDefs[0] as AgentDefinition | undefined) ?? { id: '', agentFrameworkConfig: {} } as AgentDefinition}
              onChange={(_event, value) => handleSelect(value)}
              filterOptions={(options, state) => {
                const query = state.inputValue.toLowerCase();
                if (!query) return options;
                return options.filter((o) =>
                  (o.name ?? o.id).toLowerCase().includes(query)
                  || (o.description ?? '').toLowerCase().includes(query),
                );
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  inputRef={searchInputReference}
                  placeholder='Search agents...'
                  autoFocus
                  data-testid='agent-switcher-search'
                  sx={{ mb: 0.5 }}
                />
              )}
              renderOption={(props, option) => (
                <Box
                  component='li'
                  {...props}
                  key={option.id}
                  data-testid={`agent-switcher-option-${option.id}`}
                  sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start !important', py: 0.5 }}
                >
                  <Typography variant='body2' sx={{ fontWeight: option.id === currentAgentDefId ? 600 : 400 }}>
                    {option.name ?? option.id}
                  </Typography>
                  {option.description && (
                    <Typography variant='caption' color='text.secondary' noWrap sx={{ maxWidth: '100%' }}>
                      {option.description}
                    </Typography>
                  )}
                </Box>
              )}
              slotProps={{
                paper: { sx: { boxShadow: 'none', border: 'none' } },
                listbox: { sx: { maxHeight: 280 }, 'data-testid': 'agent-switcher-listbox' } as React.HTMLAttributes<HTMLUListElement> & { 'data-testid': string },
              }}
              // Prevent the autocomplete from closing the parent popper
              disablePortal
              // No clear button, selection always set
              disableClearable
            />
          </DropdownPaper>
        </ClickAwayListener>
      </Popper>
    </>
  );
};
