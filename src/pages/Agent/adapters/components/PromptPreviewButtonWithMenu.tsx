import { useAui } from '@memeloop/react-ui/chat';
import ArticleIcon from '@mui/icons-material/Article';
import { IconButton, Menu, MenuItem, Tooltip } from '@mui/material';
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';

import { useAgentChatStore } from '@/pages/Agent/store/agentChatStore';
import { useTabStore } from '@/pages/Agent/store/tabStore';
import { TabType } from '@/pages/Agent/types/tab';
import { PromptPreviewDialog } from './PromptPreviewDialog';

interface PromptPreviewButtonWithMenuProps {
  /** ID of the current tab (used to build a split view). */
  tabId: string;
  /** Whether the current tab is already inside a split view. */
  isSplitView?: boolean;
  /** ID of the agent definition to edit in split view. */
  agentDefId?: string;
  /** Whether the button is disabled. */
  disabled?: boolean;
}

const LONG_PRESS_DURATION = 600;

/**
 * Prompt preview button.
 *
 * - Left click: open the prompt preview dialog.
 * - Right click (desktop): open a context menu with edit options.
 * - Long press (mobile): open the same context menu.
 */
export const PromptPreviewButtonWithMenu: React.FC<PromptPreviewButtonWithMenuProps> = ({
  tabId,
  isSplitView,
  agentDefId,
  disabled,
}) => {
  const { t } = useTranslation('agent');
  const aui = useAui();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [previewInputText, setPreviewInputText] = useState('');
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);

  const { agent, previewDialogOpen, previewDialogBaseMode, openPreviewDialog, closePreviewDialog } = useAgentChatStore(
    useShallow((state) => ({
      agent: state.agent,
      previewDialogOpen: state.previewDialogOpen,
      previewDialogBaseMode: state.previewDialogBaseMode,
      openPreviewDialog: state.openPreviewDialog,
      closePreviewDialog: state.closePreviewDialog,
    })),
  );

  const { addTab, createSplitViewFromTabs, addTabToSplitView, tabs } = useTabStore();

  const handleOpenPreview = useCallback(() => {
    setPreviewInputText(aui.composer().getState().text);
    openPreviewDialog();
  }, [aui, openPreviewDialog]);

  const handleOpenEdit = useCallback(() => {
    setPreviewInputText(aui.composer().getState().text);
    openPreviewDialog({ baseMode: 'edit' });
    setMenuAnchor(null);
  }, [aui, openPreviewDialog]);

  const handleOpenEditInSplitView = useCallback(async () => {
    setMenuAnchor(null);
    const definitionId = agentDefId ?? agent?.agentDefId;
    if (!definitionId) return;

    try {
      const editTab = await addTab(TabType.EDIT_AGENT_DEFINITION, { agentDefId: definitionId });

      if (isSplitView) {
        const splitViewTab = tabs.find(
          (tab) => tab.type === TabType.SPLIT_VIEW && tab.childTabs.some((child) => child.id === tabId),
        );
        if (splitViewTab) {
          await addTabToSplitView(splitViewTab.id, editTab.id);
          return;
        }
      }

      await createSplitViewFromTabs(editTab.id);
    } catch (error) {
      void window.service.native.log('error', 'Failed to open edit in split view', { error });
    }
  }, [addTab, addTabToSplitView, agent?.agentDefId, agentDefId, createSplitViewFromTabs, isSplitView, tabId, tabs]);

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
        <MenuItem onClick={handleOpenEditInSplitView} dense>
          {t('Prompt.EnterEditSideBySide')}
        </MenuItem>
      </Menu>
      <PromptPreviewDialog
        open={previewDialogOpen}
        onClose={closePreviewDialog}
        inputText={previewInputText}
        initialBaseMode={previewDialogBaseMode}
      />
    </>
  );
};
