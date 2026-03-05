// Compact dropdown for tab switching, placed in the chat header
import AddIcon from '@mui/icons-material/Add';
import ChatIcon from '@mui/icons-material/Chat';
import CloseIcon from '@mui/icons-material/Close';
import SplitscreenIcon from '@mui/icons-material/Splitscreen';
import TabIcon from '@mui/icons-material/Tab';
import WebIcon from '@mui/icons-material/Web';
import { Box, ClickAwayListener, Divider, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Paper, Popper, Tooltip, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTabStore } from '../../store/tabStore';
import { TabItem, TabType } from '../../types/tab';

const DropdownPaper = styled(Paper)(({ theme }) => ({
  minWidth: 260,
  maxWidth: 400,
  maxHeight: 420,
  borderRadius: 8,
  boxShadow: theme.shadows[8],
  overflow: 'auto',
}));

const TabEntry = styled(ListItemButton, { shouldForwardProp: (p) => p !== 'active' })<{ active?: boolean }>(({ theme, active }) => ({
  borderRadius: 6,
  margin: '1px 4px',
  backgroundColor: active ? theme.palette.action.selected : 'transparent',
  '&:hover .tab-close': {
    opacity: 1,
  },
}));

function getTabIcon(type: TabType) {
  switch (type) {
    case TabType.WEB:
      return <WebIcon fontSize='small' />;
    case TabType.CHAT:
      return <ChatIcon fontSize='small' />;
    case TabType.SPLIT_VIEW:
      return <SplitscreenIcon fontSize='small' />;
    default:
      return <TabIcon fontSize='small' />;
  }
}

export const TabListDropdown: React.FC = () => {
  const { t } = useTranslation('agent');
  const { tabs, activeTabId, setActiveTab, closeTab, addTab } = useTabStore();
  const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorElement);

  const handleToggle = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorElement((previous) => (previous ? null : event.currentTarget));
  }, []);

  const handleClose = useCallback(() => {
    setAnchorElement(null);
  }, []);

  const handleSelectTab = useCallback((tabId: string) => {
    setActiveTab(tabId);
    handleClose();
  }, [setActiveTab, handleClose]);

  const handleCloseTab = useCallback((event: React.MouseEvent, tabId: string) => {
    event.stopPropagation();
    closeTab(tabId);
  }, [closeTab]);

  const handleNewTab = useCallback(async () => {
    await addTab(TabType.NEW_TAB);
    handleClose();
  }, [addTab, handleClose]);

  // Sort: pinned first, then by creation time (newest first)
  const sortedTabs = [...tabs].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return b.createdAt - a.createdAt;
  });

  const activeTab = tabs.find(tab => tab.id === activeTabId);

  return (
    <>
      <Tooltip title={t('Tab.TabList')}>
        <IconButton
          size='small'
          onClick={handleToggle}
          data-testid='tab-list-button'
          sx={{ ml: 0.5 }}
        >
          <TabIcon fontSize='small' />
          {tabs.length > 1 && (
            <Typography
              variant='caption'
              sx={{
                position: 'absolute',
                top: -2,
                right: -2,
                fontSize: 10,
                fontWeight: 700,
                backgroundColor: 'primary.main',
                color: 'primary.contrastText',
                borderRadius: '50%',
                width: 16,
                height: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {tabs.length}
            </Typography>
          )}
        </IconButton>
      </Tooltip>
      {/* Standalone new-tab button — keeps backward-compatible test selector */}
      <Tooltip title={t('NewTab.NewTab')}>
        <IconButton
          size='small'
          onClick={() => {
            void handleNewTab();
          }}
          data-tab-id='new-tab-button'
          data-testid='new-tab-button'
        >
          <AddIcon fontSize='small' />
        </IconButton>
      </Tooltip>

      <Popper
        open={open}
        anchorEl={anchorElement}
        placement='bottom-start'
        style={{ zIndex: 1500 }}
        modifiers={[{ name: 'offset', options: { offset: [0, 4] } }]}
      >
        <ClickAwayListener onClickAway={handleClose}>
          <DropdownPaper data-testid='tab-list-dropdown'>
            <List dense disablePadding sx={{ py: 0.5 }}>
              {sortedTabs.map((tab: TabItem) => (
                <TabEntry
                  key={tab.id}
                  active={tab.id === activeTabId}
                  onClick={() => {
                    handleSelectTab(tab.id);
                  }}
                  data-testid={`tab-list-item-${tab.id}`}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    {getTabIcon(tab.type)}
                  </ListItemIcon>
                  <ListItemText
                    primary={tab.title}
                    slotProps={{ primary: { noWrap: true, variant: 'body2' } }}
                  />
                  <IconButton
                    size='small'
                    className='tab-close'
                    sx={{ opacity: 0, transition: 'opacity 0.15s', ml: 0.5 }}
                    onClick={(event) => {
                      handleCloseTab(event, tab.id);
                    }}
                    data-testid={`tab-close-${tab.id}`}
                  >
                    <CloseIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </TabEntry>
              ))}
            </List>
            <Divider />
            <Box sx={{ p: 0.5 }}>
              <ListItemButton
                onClick={() => {
                  void handleNewTab();
                }}
                sx={{ borderRadius: 6, mx: 0.5 }}
                data-testid='tab-list-new-tab'
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <AddIcon fontSize='small' />
                </ListItemIcon>
                <ListItemText
                  primary={t('NewTab.NewTab')}
                  slotProps={{ primary: { variant: 'body2' } }}
                />
              </ListItemButton>
            </Box>
          </DropdownPaper>
        </ClickAwayListener>
      </Popper>
    </>
  );
};
