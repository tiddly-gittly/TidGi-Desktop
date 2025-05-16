import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import RestoreIcon from '@mui/icons-material/Restore';
import SplitscreenIcon from '@mui/icons-material/Splitscreen';
import { Collapse, Divider, List, ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material';
import { PropsWithChildren, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useTabStore } from '../../store/tabStore';
import { TabType } from '../../types/tab';

// Create global context menu state
interface TabContextMenuState {
  isOpen: boolean;
  position: { top: number; left: number };
  targetTabId: string | null;
}

export const TabContextMenu = ({ children }: PropsWithChildren) => {
  const { t } = useTranslation('agent');
  const {
    tabs,
    activeTabId,
    closeTab,
    pinTab,
    addTab,
    convertToSplitView,
    addTabToSplitView,
    closeTabs,
    getTabIndex,
    restoreClosedTab,
    hasClosedTabs,
    createSplitViewFromTabs,
  } = useTabStore();

  const tabContainerReference = useRef<HTMLDivElement>(null);

  // Nested menu state
  const [closeMenuOpen, setCloseMenuOpen] = useState(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<TabContextMenuState>({
    isOpen: false,
    position: { top: 0, left: 0 },
    targetTabId: null,
  });

  // Get current target tab
  const targetTab = contextMenu.targetTabId
    ? tabs.find(tab => tab.id === contextMenu.targetTabId)
    : null;

  // Get the currently active tab
  const activeTab = tabs.find(tab => tab.id === activeTabId);

  // Check if active tab is a split view
  const isActiveSplitViewTab = activeTab?.type === TabType.SPLIT_VIEW;
  const activeSplitViewTab = isActiveSplitViewTab ? (activeTab) : undefined;

  // Close context menu
  const handleClose = useCallback(() => {
    setContextMenu(previous => ({ ...previous, isOpen: false }));
    setCloseMenuOpen(false);
  }, []);

  // Handle pin/unpin tab
  const handlePinTab = useCallback(() => {
    if (contextMenu.targetTabId && targetTab) {
      pinTab(contextMenu.targetTabId, !targetTab.isPinned);
      handleClose();
    }
  }, [contextMenu.targetTabId, pinTab, handleClose, targetTab]);

  // Handle closing tab
  const handleCloseTab = useCallback(() => {
    if (contextMenu.targetTabId) {
      closeTab(contextMenu.targetTabId);
      handleClose();
    }
  }, [contextMenu.targetTabId, closeTab, handleClose]);

  // Duplicate current tab
  const handleDuplicateTab = useCallback(async () => {
    if (!targetTab) return;
    switch (targetTab.type) {
      case TabType.WEB:
        await addTab(TabType.WEB, {
          url: (targetTab).url,
          title: targetTab.title,
        });
        break;
      case TabType.CHAT:
        await addTab(TabType.CHAT, {
          title: targetTab.title,
        });
        break;
      case TabType.NEW_TAB:
        await addTab(TabType.NEW_TAB);
        break;
    }
    handleClose();
  }, [targetTab, addTab, handleClose]);

  // Handle creating split view with active tab and target tab
  const handleCreateSplitViewWithActiveTab = useCallback(async () => {
    if (contextMenu.targetTabId && activeTabId) {
      // createSplitViewFromTabs expects the second tab ID (which will be combined with the active tab)
      await createSplitViewFromTabs(contextMenu.targetTabId);
      handleClose();
    }
  }, [contextMenu.targetTabId, activeTabId, createSplitViewFromTabs, handleClose]);

  // Handle converting tab to split view
  const handleConvertToSplitView = useCallback(async () => {
    if (contextMenu.targetTabId) {
      await convertToSplitView(contextMenu.targetTabId);
      handleClose();
    }
  }, [contextMenu.targetTabId, convertToSplitView, handleClose]);

  // Handle adding tab to existing split view tab
  const handleAddTabToSplitView = useCallback(async () => {
    if (contextMenu.targetTabId && activeTabId) {
      await addTabToSplitView(activeTabId, contextMenu.targetTabId);
      handleClose();
    }
  }, [contextMenu.targetTabId, activeTabId, addTabToSplitView, handleClose]);

  // Create new tab below
  const handleNewTabBelow = useCallback(async () => {
    if (targetTab) {
      const currentTabIndex = getTabIndex(targetTab.id);
      await addTab(TabType.NEW_TAB, { insertPosition: currentTabIndex + 1 });
      handleClose();
    }
  }, [targetTab, getTabIndex, addTab, handleClose]);

  // Restore recently closed tab
  const handleRestoreClosedTab = useCallback(() => {
    restoreClosedTab();
    handleClose();
  }, [restoreClosedTab, handleClose]);

  // Batch close tabs
  const handleCloseAboveTabs = useCallback(() => {
    if (contextMenu.targetTabId) {
      closeTabs('above', contextMenu.targetTabId);
      handleClose();
    }
  }, [contextMenu.targetTabId, closeTabs, handleClose]);

  const handleCloseBelowTabs = useCallback(() => {
    if (contextMenu.targetTabId) {
      closeTabs('below', contextMenu.targetTabId);
      handleClose();
    }
  }, [contextMenu.targetTabId, closeTabs, handleClose]);

  const handleCloseOtherTabs = useCallback(() => {
    if (contextMenu.targetTabId) {
      closeTabs('other', contextMenu.targetTabId);
      handleClose();
    }
  }, [contextMenu.targetTabId, closeTabs, handleClose]);

  // Toggle close tabs nested menu
  const handleCloseMenuToggle = useCallback(() => {
    setCloseMenuOpen(previous => !previous);
  }, []);

  // Register context menu event only for tab container
  useEffect(() => {
    const container = tabContainerReference.current;
    if (!container) return;

    // Listen for right-click events on tab items
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();

      // Find which tab item was clicked by looking for the closest element with data-tab-id attribute
      const tabElement = (event.target as HTMLElement).closest('[data-tab-id]');
      if (!tabElement) return;

      const tabId = tabElement.getAttribute('data-tab-id');
      if (tabId) {
        setContextMenu({
          isOpen: true,
          position: { top: event.clientY, left: event.clientX },
          targetTabId: tabId,
        });

        // Reset nested menu state
        setCloseMenuOpen(false);
      }
    };

    // Add context menu event listener to tab container only
    container.addEventListener('contextmenu', handleContextMenu);

    // Cleanup function
    return () => {
      container.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  if (!targetTab) {
    return <div ref={tabContainerReference}>{children}</div>;
  }

  return (
    <>
      <div ref={tabContainerReference}>{children}</div>

      <Menu
        open={contextMenu.isOpen}
        onClose={handleClose}
        anchorReference='anchorPosition'
        anchorPosition={contextMenu.isOpen
          ? { top: contextMenu.position.top, left: contextMenu.position.left }
          : undefined}
      >
        <MenuItem onClick={handlePinTab}>
          <ListItemIcon>
            {targetTab.isPinned ? <PushPinOutlinedIcon fontSize='small' /> : <PushPinIcon fontSize='small' />}
          </ListItemIcon>
          <ListItemText>
            {targetTab.isPinned ? t('ContextMenu.Unpin') : t('ContextMenu.Pin')}
          </ListItemText>
        </MenuItem>

        <MenuItem onClick={handleNewTabBelow}>
          <ListItemIcon>
            <AddIcon fontSize='small' />
          </ListItemIcon>
          <ListItemText>{t('ContextMenu.NewTabBelow')}</ListItemText>
        </MenuItem>

        {/* Create split view from active tab */}
        {targetTab.id === activeTabId && targetTab.type !== TabType.SPLIT_VIEW && (
          <MenuItem onClick={handleConvertToSplitView}>
            <ListItemIcon>
              <SplitscreenIcon fontSize='small' />
            </ListItemIcon>
            <ListItemText>{t('ContextMenu.ConvertToSplitView')}</ListItemText>
          </MenuItem>
        )}

        {/* Create split view with active tab and this tab */}
        {activeTabId &&
          targetTab.id !== activeTabId &&
          (targetTab.type === TabType.WEB || targetTab.type === TabType.CHAT) &&
          activeTab &&
          activeTab.type !== TabType.SPLIT_VIEW && (
          <MenuItem onClick={handleCreateSplitViewWithActiveTab}>
            <ListItemIcon>
              <SplitscreenIcon fontSize='small' />
            </ListItemIcon>
            <ListItemText>{t('ContextMenu.CreateSplitViewWithActive')}</ListItemText>
          </MenuItem>
        )}

        {/* Add to existing active split view */}
        {activeTab?.type === TabType.SPLIT_VIEW &&
          targetTab.id !== activeTab.id &&
          targetTab.type !== TabType.SPLIT_VIEW &&
          activeSplitViewTab &&
          !activeSplitViewTab.childTabs.some(child => child.id === targetTab.id) &&
          activeSplitViewTab.childTabs.length < 2 && (
          <MenuItem onClick={handleAddTabToSplitView}>
            <ListItemIcon>
              <SplitscreenIcon fontSize='small' />
            </ListItemIcon>
            <ListItemText>{t('ContextMenu.AddToCurrentSplitView')}</ListItemText>
          </MenuItem>
        )}

        {targetTab.type === TabType.WEB && (
          <MenuItem>
            <ListItemIcon>
              <RefreshIcon fontSize='small' />
            </ListItemIcon>
            <ListItemText>{t('ContextMenu.Refresh')}</ListItemText>
          </MenuItem>
        )}

        <MenuItem onClick={handleDuplicateTab}>
          <ListItemIcon>
            <ContentCopyIcon fontSize='small' />
          </ListItemIcon>
          <ListItemText>{t('ContextMenu.Duplicate')}</ListItemText>
        </MenuItem>

        <Divider />

        <MenuItem onClick={handleCloseTab}>
          <ListItemIcon>
            <CloseIcon fontSize='small' />
          </ListItemIcon>
          <ListItemText>{t('ContextMenu.Close')}</ListItemText>
        </MenuItem>

        <MenuItem onClick={handleCloseMenuToggle}>
          <ListItemIcon>
            <CloseIcon fontSize='small' />
          </ListItemIcon>
          <ListItemText>{t('ContextMenu.CloseTabs')}</ListItemText>
          {closeMenuOpen ? <ExpandLessIcon fontSize='small' /> : <ExpandMoreIcon fontSize='small' />}
        </MenuItem>

        <Collapse in={closeMenuOpen} timeout='auto' unmountOnExit>
          <List disablePadding sx={{ pl: 2 }}>
            <MenuItem onClick={handleCloseAboveTabs}>
              <ListItemText sx={{ pl: 2 }}>{t('ContextMenu.CloseAbove')}</ListItemText>
            </MenuItem>
            <MenuItem onClick={handleCloseBelowTabs}>
              <ListItemText sx={{ pl: 2 }}>{t('ContextMenu.CloseBelow')}</ListItemText>
            </MenuItem>
            <MenuItem onClick={handleCloseOtherTabs}>
              <ListItemText sx={{ pl: 2 }}>{t('ContextMenu.CloseOther')}</ListItemText>
            </MenuItem>
          </List>
        </Collapse>

        {hasClosedTabs() && (
          <MenuItem onClick={handleRestoreClosedTab}>
            <ListItemIcon>
              <RestoreIcon fontSize='small' />
            </ListItemIcon>
            <ListItemText>{t('ContextMenu.RestoreClosed')}</ListItemText>
          </MenuItem>
        )}
      </Menu>
    </>
  );
};
