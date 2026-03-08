// Compact dropdown for tab switching, placed in the chat header
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import AddIcon from '@mui/icons-material/Add';
import ChatIcon from '@mui/icons-material/Chat';
import CloseIcon from '@mui/icons-material/Close';
import SplitscreenIcon from '@mui/icons-material/Splitscreen';
import TabIcon from '@mui/icons-material/Tab';
import WebIcon from '@mui/icons-material/Web';
import { Box, ClickAwayListener, Divider, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Paper, Popper, Tooltip, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useTabStore } from '../../store/tabStore';
import { TabItem, TabType } from '../../types/tab';

interface TabBackgroundTask {
  agentId: string;
  agentName?: string;
  type: 'heartbeat' | 'alarm';
  intervalSeconds?: number;
  wakeAtISO?: string;
  nextWakeAtISO?: string;
  message?: string;
  repeatIntervalMinutes?: number;
}

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

const formatWakeTime = (iso?: string): string => {
  if (!iso) return 'Unknown';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const normalizeBackgroundTasks = (raw: unknown): TabBackgroundTask[] => {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const agentId = record.agentId;
    if (typeof agentId !== 'string') return [];
    return [{
      agentId,
      agentName: typeof record.agentName === 'string' ? record.agentName : undefined,
      type: record.type === 'alarm' ? 'alarm' : 'heartbeat',
      intervalSeconds: typeof record.intervalSeconds === 'number' ? record.intervalSeconds : undefined,
      wakeAtISO: typeof record.wakeAtISO === 'string' ? record.wakeAtISO : undefined,
      nextWakeAtISO: typeof record.nextWakeAtISO === 'string' ? record.nextWakeAtISO : undefined,
      message: typeof record.message === 'string' ? record.message : undefined,
      repeatIntervalMinutes: typeof record.repeatIntervalMinutes === 'number' ? record.repeatIntervalMinutes : undefined,
    }];
  });
};

export const TabListDropdown: React.FC = () => {
  const { t } = useTranslation('agent');
  const { tabs, activeTabId, setActiveTab, closeTab, addTab } = useTabStore();
  const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null);
  const [backgroundTasks, setBackgroundTasks] = useState<TabBackgroundTask[]>([]);
  const open = Boolean(anchorElement);

  const refreshBackgroundTasks = useCallback(async () => {
    try {
      const agentInstanceService = window.service.agentInstance as {
        getBackgroundTasks: () => Promise<unknown>;
      };
      const rawTasks = await agentInstanceService.getBackgroundTasks();
      setBackgroundTasks(normalizeBackgroundTasks(rawTasks));
    } catch {
      // Ignore transient IPC errors during startup.
    }
  }, []);

  useEffect(() => {
    void refreshBackgroundTasks();
    const timer = window.setInterval(() => {
      void refreshBackgroundTasks();
    }, 1_500);
    return () => {
      window.clearInterval(timer);
    };
  }, [refreshBackgroundTasks]);

  const backgroundTasksByAgent = useMemo(() => {
    const map = new Map<string, TabBackgroundTask[]>();
    for (const task of backgroundTasks) {
      const existing = map.get(task.agentId) ?? [];
      existing.push(task);
      map.set(task.agentId, existing);
    }
    return map;
  }, [backgroundTasks]);

  const getTasksForTab = useCallback((tab: TabItem): TabBackgroundTask[] => {
    if (tab.type !== TabType.CHAT) return [];
    if (!tab.agentId) return [];
    return backgroundTasksByAgent.get(tab.agentId) ?? [];
  }, [backgroundTasksByAgent]);

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
  const activeTabTasks = activeTab ? getTasksForTab(activeTab) : [];
  const sortedActiveTasks = [...activeTabTasks].sort((a, b) => {
    const aWake = a.nextWakeAtISO ?? a.wakeAtISO;
    const bWake = b.nextWakeAtISO ?? b.wakeAtISO;
    const aTime = aWake ? new Date(aWake).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = bWake ? new Date(bWake).getTime() : Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });
  const nearestActiveTask = sortedActiveTasks[0];
  const activeTaskTooltip = nearestActiveTask
    ? `Next wake: ${formatWakeTime(nearestActiveTask.nextWakeAtISO ?? nearestActiveTask.wakeAtISO)}${activeTabTasks.length > 1 ? ` (+${activeTabTasks.length - 1} more)` : ''}`
    : '';

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
      {activeTabTasks.length > 0 && (
        <Tooltip title={activeTaskTooltip}>
          <IconButton
            size='small'
            data-testid='active-tab-scheduled-task-indicator'
            aria-label={activeTaskTooltip}
            sx={{ ml: 0.25 }}
          >
            <AccessTimeIcon fontSize='small' color='warning' />
          </IconButton>
        </Tooltip>
      )}
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
              {sortedTabs.map((tab: TabItem) => {
                const tabTasks = getTasksForTab(tab);
                const sortedTabTasks = [...tabTasks].sort((a, b) => {
                  const aWake = a.nextWakeAtISO ?? a.wakeAtISO;
                  const bWake = b.nextWakeAtISO ?? b.wakeAtISO;
                  const aTime = aWake ? new Date(aWake).getTime() : Number.MAX_SAFE_INTEGER;
                  const bTime = bWake ? new Date(bWake).getTime() : Number.MAX_SAFE_INTEGER;
                  return aTime - bTime;
                });
                const nearestTask = sortedTabTasks[0];
                const nearestWake = nearestTask?.nextWakeAtISO ?? nearestTask?.wakeAtISO;
                const scheduleTooltip = tabTasks.length > 0
                  ? `Next wake: ${formatWakeTime(nearestWake)}${tabTasks.length > 1 ? ` (+${tabTasks.length - 1} more)` : ''}`
                  : '';
                const closeTooltip = tabTasks.length > 0
                  ? `This agent has active scheduled tasks. Next wake: ${formatWakeTime(nearestWake)}. Closing this tab will not stop background wake-ups.`
                  : 'Close tab';

                return (
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
                    {tabTasks.length > 0 && (
                      <Tooltip title={scheduleTooltip}>
                        <IconButton
                          size='small'
                          sx={{ ml: 0.25 }}
                          data-testid={`tab-scheduled-task-indicator-${tab.id}`}
                          aria-label={scheduleTooltip}
                        >
                          <AccessTimeIcon sx={{ fontSize: 14 }} color='warning' />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title={closeTooltip}>
                      <IconButton
                        size='small'
                        className='tab-close'
                        sx={{ opacity: 0, transition: 'opacity 0.15s', ml: 0.5 }}
                        onClick={(event) => {
                          handleCloseTab(event, tab.id);
                        }}
                        data-testid={`tab-close-${tab.id}`}
                        aria-label={closeTooltip}
                      >
                        <CloseIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  </TabEntry>
                );
              })}
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
