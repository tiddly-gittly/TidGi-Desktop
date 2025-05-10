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
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useTabStore } from '../../store/tabStore';
import { TabType } from '../../types/tab';

// Create global context menu state
interface TabContextMenuState {
  isOpen: boolean;
  position: { top: number; left: number };
  targetTabId: string | null;
}

export const TabContextMenu = () => {
  const { t } = useTranslation('agent');
  const {
    tabs,
    closeTab,
    pinTab,
    addTab,
    addToSplitView,
    splitViewIds,
    closeTabs,
    getTabIndex,
    restoreClosedTab,
    hasClosedTabs,
  } = useTabStore();

  // Nested menu state
  const [closeMenuOpen, setCloseMenuOpen] = useState(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<TabContextMenuState>({
    isOpen: false,
    position: { top: 0, left: 0 },
    targetTabId: null,
  });

  // Register global right-click event
  React.useEffect(() => {
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
    };            // Add context menu event listener
    document.addEventListener('contextmenu', handleContextMenu);

    // Cleanup function
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  // Close context menu
  const handleClose = () => {
    setContextMenu({ ...contextMenu, isOpen: false });
    setCloseMenuOpen(false);
  };

  // Get current target tab
  const targetTab = contextMenu.targetTabId
    ? tabs.find(tab => tab.id === contextMenu.targetTabId)
    : null;

  if (!targetTab) {
    return null;
  }

  // Get tab position in the list
  const tabIndex = getTabIndex(targetTab.id);

  // Handle pin/unpin tab
  const handlePinTab = () => {
    pinTab(targetTab.id, !targetTab.isPinned);
    handleClose();
  };

  // Handle closing tab
  const handleCloseTab = () => {
    closeTab(targetTab.id);
    handleClose();
  };

  // Duplicate current tab
  const handleDuplicateTab = () => {
    switch (targetTab.type) {
      case TabType.WEB:
        addTab(TabType.WEB, {
          url: (targetTab).url,
          title: targetTab.title,
        });
        break;
      case TabType.CHAT:
        addTab(TabType.CHAT, {
          title: targetTab.title,
        });
        break;
      case TabType.NEW_TAB:
        addTab(TabType.NEW_TAB);
        break;
    }
    handleClose();
  };

  // Handle add to split view
  const handleAddToSplitView = () => {
    addToSplitView(targetTab.id);
    handleClose();
  };

  // Create new tab below
  const handleNewTabBelow = () => {
    addTab(TabType.NEW_TAB, { insertPosition: tabIndex + 1 });
    handleClose();
  };

  // Restore recently closed tab
  const handleRestoreClosedTab = () => {
    restoreClosedTab();
    handleClose();
  };

  // Batch close tabs
  const handleCloseAboveTabs = () => {
    closeTabs('above', targetTab.id);
    handleClose();
  };

  const handleCloseBelowTabs = () => {
    closeTabs('below', targetTab.id);
    handleClose();
  };

  const handleCloseOtherTabs = () => {
    closeTabs('other', targetTab.id);
    handleClose();
  };

  // Determine if tab can be added to split view
  const canAddToSplitView = splitViewIds.length < 2 && !splitViewIds.includes(targetTab.id);

  // Toggle close tabs nested menu
  const handleCloseMenuToggle = () => {
    setCloseMenuOpen(!closeMenuOpen);
  };

  return (
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

      {canAddToSplitView && (
        <MenuItem onClick={handleAddToSplitView}>
          <ListItemIcon>
            <SplitscreenIcon fontSize='small' />
          </ListItemIcon>
          <ListItemText>{t('ContextMenu.AddToSplitView')}</ListItemText>
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
  );
};
