import RestartAltIcon from '@mui/icons-material/RestartAlt';
import BadgeRaw from '@mui/material/Badge';
import { keyframes, styled } from '@mui/material/styles';
import Promise from 'bluebird';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { getAssetsFileUrl } from '@/helpers/url';
import { Tooltip } from '@mui/material';
import defaultIcon from '../../../images/default-icon.png';

Promise.config({ cancellation: true });

const Root = styled('div')`
  height: fit-content;
  width: auto;
  padding: 10px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  outline: none;
  &:hover {
    cursor: pointer;
    opacity: 1;
  }
  -webkit-app-region: no-drag;
  opacity: 0.7;
  position: relative;
  border: 0;
  border-color: transparent;
  &[data-hibernated='true'] {
    opacity: 0.4;
  }
  &[data-active='true'] {
    opacity: 1;
  }
  box-sizing: border-box;
  border-left: 3px solid ${({ theme }) => theme.palette.text.primary};
  &:not([data-active='true']) {
    border-left-color: transparent;
  }
  &[data-workspace-clicked-loading='true']:hover {
    cursor: wait;
  }
`;

const backgroundColorShift = keyframes`
from {background-color: #dddddd;}
  to {background-color: #eeeeee}
`;
const Avatar = styled('div')`
  height: 36px;
  width: 36px;
  border-radius: 4px;
  line-height: 36px;
  text-align: center;
  font-weight: 500;
  text-transform: uppercase;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  transition: background-color 0.15s ease, outline 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
  &[data-large='true'] {
    height: 44px;
    width: 44px;
    line-height: 44px;
  }
  &[data-transparent='true'] {
    background: transparent;
    border: none;
    border-radius: 0;
  }

  &[data-highlight-add='true'][data-add-avatar='true'], &:hover {
    background-color: ${({ theme }) => theme.palette.background.default};
    animation: ${backgroundColorShift} 5s infinite;
    animation-direction: alternate;
    animation-timing-function: cubic-bezier(0.4, 0, 1, 1);
    color: ${({ theme }) => theme.palette.common.black};
  }
  &[data-add-avatar='true'] {
    background-color: transparent;
  }
  &[data-drag-intent='group'] {
    background-color: ${({ theme }) => theme.palette.primary.light} !important;
    outline: 2px solid ${({ theme }) => theme.palette.primary.main};
    box-shadow: 0 0 0 4px ${({ theme }) => theme.palette.primary.main}33;
    transform: scale(1.06);
  }
  &[data-drag-intent='ungroup'] {
    background-color: ${({ theme }) => theme.palette.error.light} !important;
    outline: 2px solid ${({ theme }) => theme.palette.error.main};
    box-shadow: 0 0 0 4px ${({ theme }) => theme.palette.error.main}33;
    transform: scale(1.06);
  }
`;

const AvatarPicture = styled('img')`
  height: calc(36px - 2px);
  width: calc(36px - 2px);
  &[data-large='true'] {
    height: 44px;
    width: 44px;
  }
`;

const ShortcutText = styled('p')`
  margin-top: 2px;
  margin-bottom: 0;
  padding: 0;
  font-size: 12px;
  font-weight: 500;
  display: inline-block;
  word-break: break-all;
  text-align: center;
  &[data-active='true'] {
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }
`;
const Badge = styled(BadgeRaw)`
  line-height: 20px;
`;

interface Props {
  active?: boolean;
  badgeCount?: number;
  customIcon?: React.ReactElement;
  dragIntent?: 'group' | 'ungroup' | 'reorder-before' | 'reorder-after' | null;
  hibernated?: boolean;
  id: string;
  index?: number;
  onClick?: () => void;
  pageType?: string;
  picturePath?: string | null;
  restarting?: boolean;
  showSideBarIcon: boolean;
  showSidebarTexts?: boolean;
  transparentBackground?: boolean;
  workspaceClickedLoading?: boolean;
  workspaceCount?: number;
  workspaceName?: string;
}
export function WorkspaceSelectorBase({
  active = false,
  restarting: loading = false,
  badgeCount = 0,
  customIcon,
  dragIntent = null,
  hibernated = false,
  showSideBarIcon,
  id,
  index = 0,
  pageType,
  picturePath,
  showSidebarTexts = true,
  transparentBackground = false,
  workspaceName,
  workspaceClickedLoading = false,
  onClick = () => {},
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  let icon = showSideBarIcon && (
    <Avatar
      data-large={!showSidebarTexts ? 'true' : 'false'}
      data-transparent={transparentBackground ? 'true' : 'false'}
      data-add-avatar={id === 'add' ? 'true' : 'false'}
      data-highlight-add={index === 0 ? 'true' : 'false'}
      data-drag-intent={dragIntent ?? 'none'}
      id={id === 'add' ? 'add-workspace-button' : id === 'guide' ? 'guide-workspace-button' : `workspace-avatar-${id}`}
    >
      {id === 'add'
        ? (
          '+'
        )
        : (id === 'guide'
          ? (
            '※'
          )
          : customIcon || (
            <AvatarPicture alt='Icon' data-large={!showSidebarTexts ? 'true' : 'false'} src={picturePath ? getAssetsFileUrl(picturePath) : defaultIcon} draggable={false} />
          ))}
    </Avatar>
  );
  if (loading) {
    icon = (
      <Tooltip title={<span>{t('Dialog.Restarting')}</span>}>
        <Avatar>
          <RestartAltIcon />
        </Avatar>
      </Tooltip>
    );
  }
  return (
    <Root
      data-hibernated={hibernated ? 'true' : 'false'}
      data-active={active ? 'true' : 'false'}
      data-workspace-clicked-loading={workspaceClickedLoading ? 'true' : 'false'}
      onClick={workspaceClickedLoading ? () => {} : onClick}
      data-testid={pageType ? `workspace-${pageType}` : `workspace-${id}`}
      data-drag-intent={dragIntent ?? 'none'}
    >
      <Badge color='secondary' badgeContent={badgeCount} max={99}>
        {icon}
      </Badge>
      {showSidebarTexts && (
        <ShortcutText data-active={active ? 'true' : 'false'}>
          {workspaceName}
        </ShortcutText>
      )}
    </Root>
  );
}
