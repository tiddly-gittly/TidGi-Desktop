// Upward-expanding dropdown for switching agent definitions, similar to VSCode's mode switcher

import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { Box, ClickAwayListener, List, ListItemButton, ListItemText, Paper, Popper, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import type { AgentDefinition } from '@services/agentDefinition/interface';
import React, { useCallback, useEffect, useState } from 'react';

const SwitcherButton = styled(Box)<{ disabled?: boolean }>(({ theme, disabled }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 8px 2px 6px',
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
  minWidth: 220,
  maxWidth: 360,
  maxHeight: 320,
  overflow: 'auto',
  borderRadius: 8,
  boxShadow: theme.shadows[8],
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
    (definitionId: string) => {
      if (definitionId !== currentAgentDefId) {
        onSwitch(definitionId);
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
        <ArrowDropUpIcon sx={{ fontSize: 16, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </SwitcherButton>

      <Popper
        open={open}
        anchorEl={anchorElement}
        placement='top-start'
        style={{ zIndex: 1500 }}
        modifiers={[{ name: 'offset', options: { offset: [0, 4] } }]}
      >
        <ClickAwayListener onClickAway={handleClose}>
          <DropdownPaper data-testid='agent-switcher-dropdown'>
            <List dense disablePadding>
              {agentDefs.map((agentDefinition) => (
                <ListItemButton
                  key={agentDefinition.id}
                  selected={agentDefinition.id === currentAgentDefId}
                  onClick={() => {
                    handleSelect(agentDefinition.id);
                  }}
                  data-testid={`agent-switcher-option-${agentDefinition.id}`}
                >
                  <ListItemText
                    primary={agentDefinition.name ?? agentDefinition.id}
                    secondary={agentDefinition.description}
                    slotProps={{ secondary: { noWrap: true, variant: 'caption' } }}
                  />
                </ListItemButton>
              ))}
              {agentDefs.length === 0 && (
                <Box sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant='caption' color='text.secondary'>Loading...</Typography>
                </Box>
              )}
            </List>
          </DropdownPaper>
        </ClickAwayListener>
      </Popper>
    </>
  );
};
