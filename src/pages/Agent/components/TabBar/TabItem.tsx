import AccessTimeIcon from '@mui/icons-material/AccessTime';
import AddIcon from '@mui/icons-material/Add';
import AppsIcon from '@mui/icons-material/Apps';
import ChatIcon from '@mui/icons-material/Chat';
import CloseIcon from '@mui/icons-material/Close';
import PushPinIcon from '@mui/icons-material/PushPin';
import SplitscreenIcon from '@mui/icons-material/Splitscreen';
import WebIcon from '@mui/icons-material/Web';
import { ButtonBase, Tooltip, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import React from 'react';

import type { AgentBackgroundTask } from '@services/agentInstance/interface';
import { useTabStore } from '../../store/tabStore';
import { INewTabButton, TabItem as TabItemType, TabType } from '../../types/tab';

interface TabItemProps {
  /** Tab data */
  tab: TabItemType | INewTabButton;
  /** Whether this is the currently active tab */
  isActive: boolean;
  /** Callback when the tab is clicked */
  onClick: () => void;
  /** Whether this is the new tab button */
  isNewTabButton?: boolean;
  backgroundTasks?: AgentBackgroundTask[];
}

interface StyledTabProps {
  /** Whether this is the currently active tab */
  $active: boolean;
  /** Whether the tab is pinned to the sidebar */
  $pinned?: boolean;
}

const TabButton = styled(ButtonBase, { shouldForwardProp: (property) => !/^\$/.test(String(property)) })<StyledTabProps>`
  display: flex;
  align-items: center;
  width: 100%;
  height: 40px;
  border-radius: 12px;
  position: relative;
  transition: all 0.2s ease;
  padding: 0 12px;
  background-color: ${props => props.$active ? props.theme.palette.primary.main : 'transparent'};
  
  &:hover {
    background-color: ${props =>
  props.$active
    ? props.theme.palette.primary.main
    : props.theme.palette.action.hover};
  }
  
  &:hover .tab-actions {
    opacity: 1;
  }
`;

const TabIcon = styled('div', { shouldForwardProp: (property) => !/^\$/.test(String(property)) })<StyledTabProps>`
  color: ${props => props.$active ? props.theme.palette.primary.contrastText : props.theme.palette.text.primary};
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 8px;
  flex-shrink: 0;
`;

const TabLabel = styled(Typography, { shouldForwardProp: (property) => !/^\$/.test(String(property)) })<StyledTabProps>`
  font-size: 12px;
  text-align: left;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${props => props.$active ? props.theme.palette.primary.contrastText : props.theme.palette.text.primary};
`;

const TabActions = styled('div')`
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.2s;
`;

const ActionIcon = styled('div')`
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background-color: rgba(0, 0, 0, 0.1);
  
  &:hover {
    color: ${props => props.theme.palette.primary.main};
    background-color: rgba(0, 0, 0, 0.2);
  }
`;

const PinIndicator = styled('div')`
  position: absolute;
  left: 4px;
  bottom: 4px;
  font-size: 12px;
  color: ${props => props.theme.palette.text.secondary};
`;

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

export const TabItem: React.FC<TabItemProps> = ({ tab, isActive, onClick, isNewTabButton = false, backgroundTasks = [] }) => {
  const { closeTab, addTab } = useTabStore();
  const isChatTab = !isNewTabButton && tab.type === TabType.CHAT;
  const hasBackgroundTasks = isChatTab && backgroundTasks.length > 0;

  const sortedTasks = [...backgroundTasks].sort((a, b) => {
    const aWake = a.nextWakeAtISO ?? a.wakeAtISO;
    const bWake = b.nextWakeAtISO ?? b.wakeAtISO;
    const aTime = aWake ? new Date(aWake).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = bWake ? new Date(bWake).getTime() : Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });

  const nearestTask = sortedTasks[0];
  const nearestWakeAt = nearestTask?.nextWakeAtISO ?? nearestTask?.wakeAtISO;
  const scheduleIndicatorTooltip = hasBackgroundTasks
    ? `Next wake: ${formatWakeTime(nearestWakeAt)}${backgroundTasks.length > 1 ? ` (+${backgroundTasks.length - 1} more)` : ''}`
    : '';

  const closeTooltip = hasBackgroundTasks
    ? `This agent has active scheduled tasks. Next wake: ${formatWakeTime(nearestWakeAt)}. Closing this tab will not stop background wake-ups.`
    : 'Close tab';

  /** Handle tab close click event */
  const handleClose = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!isNewTabButton) {
      closeTab(tab.id);
    }
  };

  /** Handle tab click event - create new tab if new tab button, otherwise switch to tab */
  const handleClick = async () => {
    if (isNewTabButton) {
      await addTab(TabType.NEW_TAB);
    } else {
      onClick();
    }
  };

  /** Return icon component based on tab type */
  const getTabIcon = () => {
    if (isNewTabButton) {
      return <AddIcon fontSize='inherit' />;
    }
    switch (tab.type) {
      case TabType.WEB:
        return <WebIcon fontSize='inherit' />;
      case TabType.CHAT:
        return <ChatIcon fontSize='inherit' />;
      case TabType.NEW_TAB:
        return <AppsIcon fontSize='inherit' />;
      case TabType.SPLIT_VIEW:
        return <SplitscreenIcon fontSize='inherit' />;
      default:
        return <AppsIcon fontSize='inherit' />;
    }
  };

  return (
    <Tooltip title={tab.title} placement='right'>
      <TabButton
        $active={isActive}
        onClick={handleClick}
        data-tab-id={isNewTabButton ? 'new-tab-button' : tab.id}
        $pinned={!isNewTabButton && (tab as TabItemType).isPinned}
      >
        <TabIcon $active={isActive}>
          {getTabIcon()}
        </TabIcon>
        <TabLabel $active={isActive} variant='caption'>
          {tab.title}
        </TabLabel>

        {hasBackgroundTasks && (
          <Tooltip title={scheduleIndicatorTooltip} placement='top'>
            <ActionIcon
              data-testid='tab-scheduled-task-indicator'
              aria-label={scheduleIndicatorTooltip}
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <AccessTimeIcon fontSize='inherit' />
            </ActionIcon>
          </Tooltip>
        )}

        {!isNewTabButton && (
          <TabActions className='tab-actions'>
            <Tooltip title={closeTooltip} placement='top'>
              <ActionIcon data-testid='tab-close-button' aria-label={closeTooltip} onClick={handleClose}>
                <CloseIcon fontSize='inherit' />
              </ActionIcon>
            </Tooltip>
          </TabActions>
        )}

        {!isNewTabButton && (tab as TabItemType).isPinned && (
          <PinIndicator>
            <PushPinIcon fontSize='inherit' />
          </PinIndicator>
        )}
      </TabButton>
    </Tooltip>
  );
};
