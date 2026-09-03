import { useAui } from '@memeloop/react-ui/chat';
import ArticleIcon from '@mui/icons-material/Article';
import { IconButton, Menu, MenuItem, Tooltip } from '@mui/material';
import { WindowNames } from '@services/windows/WindowProperties';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface PromptPreviewButtonWithMenuProps {
  /** Durable conversation identity used for execution-equivalent context. */
  agentId: string;
  /** ID of the agent definition whose prompt configuration is editable. */
  agentDefinitionId: string;
  /** Whether the button is disabled. */
  disabled?: boolean;
}

const LONG_PRESS_DURATION = 600;

/**
 * Prompt preview button.
 *
 * - Left click: open the independent prompt workspace window.
 * - Right click (desktop): open a context menu with edit options.
 * - Long press (mobile): open the same context menu.
 */
export const PromptPreviewButtonWithMenu: React.FC<PromptPreviewButtonWithMenuProps> = ({
  agentId,
  agentDefinitionId,
  disabled,
}) => {
  const { t } = useTranslation('agent');
  const aui = useAui();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);

  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      if (previewOpenTimer.current) {
        clearTimeout(previewOpenTimer.current);
        previewOpenTimer.current = null;
      }
    };
  }, []);

  const schedulePreviewOpen = useCallback((initialBaseMode: 'preview' | 'edit' = 'preview') => {
    if (previewOpenTimer.current) clearTimeout(previewOpenTimer.current);
    // A long, repeatedly compacted conversation can make both assistant-ui's
    // composer snapshot and the MUI dialog mount expensive. Yield the click
    // task first so the toolbar stays responsive and automation observes the
    // same immediate feedback as a user instead of timing out while dispatching
    // the click itself.
    previewOpenTimer.current = setTimeout(() => {
      previewOpenTimer.current = null;
      void Promise.resolve(window.service.window.open(WindowNames.promptPreview, {
        agentId,
        agentDefinitionId,
        inputText: aui.composer.getState().text,
        initialBaseMode,
      })).catch((error: unknown) => {
        void window.service.native.log('error', 'Failed to open prompt workspace window', { error });
      });
    }, 0);
  }, [agentDefinitionId, agentId, aui]);

  const handleOpenPreview = useCallback(() => {
    schedulePreviewOpen();
  }, [schedulePreviewOpen]);

  const handleOpenEdit = useCallback(() => {
    setMenuAnchor(null);
    schedulePreviewOpen('edit');
  }, [schedulePreviewOpen]);

  const handleContextMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    setMenuAnchor(event.currentTarget);
  }, []);

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLElement>) => {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      setMenuAnchor(event.currentTarget);
    }, LONG_PRESS_DURATION);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleCloseMenu = useCallback(() => {
    setMenuAnchor(null);
  }, []);

  const open = Boolean(menuAnchor);

  return (
    <>
      <Tooltip title={t('Prompt.Preview')} disableInteractive>
        <IconButton
          size='small'
          disabled={disabled}
          onClick={handleOpenPreview}
          onContextMenu={handleContextMenu}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchMove={handleTouchEnd}
          data-testid='prompt-preview-button'
        >
          <ArticleIcon />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={menuAnchor}
        open={open}
        onClose={handleCloseMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem onClick={handleOpenEdit} dense>
          {t('Prompt.Edit')}
        </MenuItem>
      </Menu>
    </>
  );
};
