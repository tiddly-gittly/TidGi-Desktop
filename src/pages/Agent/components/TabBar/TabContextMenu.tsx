import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import PushPinIcon from '@mui/icons-material/PushPin';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import RestoreIcon from '@mui/icons-material/Restore';
import SplitscreenIcon from '@mui/icons-material/Splitscreen';
import { Collapse, Divider, List, ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { useTabStore } from '../../store/tabStore';
import { TabType } from '../../types/tab';

// 创建全局上下文菜单状态
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

  // 嵌套菜单状态
  const [closeMenuOpen, setCloseMenuOpen] = useState(false);

  // 上下文菜单状态
  const [contextMenu, setContextMenu] = useState<TabContextMenuState>({
    isOpen: false,
    position: { top: 0, left: 0 },
    targetTabId: null,
  });

  // 注册全局右键点击事件
  React.useEffect(() => {
    // 监听标签项的右键点击事件
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();

      // 查找点击的是哪个标签项，通过查找最近的带有 data-tab-id 属性的元素
      const tabElement = (event.target as HTMLElement).closest('[data-tab-id]');
      if (!tabElement) return;

      const tabId = tabElement.getAttribute('data-tab-id');
      if (tabId) {
        setContextMenu({
          isOpen: true,
          position: { top: event.clientY, left: event.clientX },
          targetTabId: tabId,
        });

        // 重置嵌套菜单状态
        setCloseMenuOpen(false);
      }
    };

    // 添加右键菜单事件监听
    document.addEventListener('contextmenu', handleContextMenu);

    // 清理函数
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  // 关闭上下文菜单
  const handleClose = () => {
    setContextMenu({ ...contextMenu, isOpen: false });
    setCloseMenuOpen(false);
  };

  // 获取当前目标标签
  const targetTab = contextMenu.targetTabId
    ? tabs.find(tab => tab.id === contextMenu.targetTabId)
    : null;

  if (!targetTab) {
    return null;
  }

  // 获取标签页在列表中的位置
  const tabIndex = getTabIndex(targetTab.id);

  // 处理固定/取消固定标签页
  const handlePinTab = () => {
    pinTab(targetTab.id, !targetTab.isPinned);
    handleClose();
  };

  // 处理关闭标签页
  const handleCloseTab = () => {
    closeTab(targetTab.id);
    handleClose();
  };

  // 复制当前标签页
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

  // 处理添加到并排视图
  const handleAddToSplitView = () => {
    addToSplitView(targetTab.id);
    handleClose();
  };

  // 在下方新建标签页
  const handleNewTabBelow = () => {
    addTab(TabType.NEW_TAB, { insertPosition: tabIndex + 1 });
    handleClose();
  };

  // 恢复最近关闭的标签页
  const handleRestoreClosedTab = () => {
    restoreClosedTab();
    handleClose();
  };

  // 批量关闭标签页
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

  // 判断是否能添加到并排视图
  const canAddToSplitView = splitViewIds.length < 2 && !splitViewIds.includes(targetTab.id);

  // 关闭标签页嵌套菜单
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
