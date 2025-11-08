import RestartAltIcon from '@mui/icons-material/RestartAlt';
import BadgeRaw from '@mui/material/Badge';
import { keyframes, styled } from '@mui/material/styles';
import Promise from 'bluebird';
import React from 'react';
import { useTranslation } from 'react-i18next';
import is from 'typescript-styled-is';

import { getAssetsFileUrl } from '@/helpers/url';
import { Tooltip } from '@mui/material';
import defaultIcon from '../../../images/default-icon.png';

Promise.config({ cancellation: true });

// Prevent transient props (starting with $) from being forwarded to the DOM
const Root = styled('div', { shouldForwardProp: (property) => !/^\$/.test(String(property)) })<{ $active?: boolean; $hibernated?: boolean; $workspaceClickedLoading?: boolean }>`
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
  ${is('$hibernated')`
    opacity: 0.4;
  `}
  ${is('$active')`
    opacity: 1;
  `}
  box-sizing: border-box;
  border-left: 3px solid ${({ $active, theme }) => ($active === true ? theme.palette.text.primary : 'transparent')};
  ${is('$workspaceClickedLoading')`
    &:hover {
      cursor: wait;
    }
  `}
`;

const backgroundColorShift = keyframes`
from {background-color: #dddddd;}
  to {background-color: #eeeeee}
`;
interface IAvatarProps {
  $addAvatar?: boolean;
  $highlightAdd?: boolean;
  $large?: boolean;
  $transparent?: boolean;
}
const Avatar = styled('div', { shouldForwardProp: (property) => !/^\$/.test(String(property)) })<IAvatarProps>`
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
  ${is('$large')`
    height: 44px;
    width: 44px;
    line-height: 44px;
  `}
  ${is('$transparent')`
      background: transparent;
      border: none;
      border-radius: 0;
    `}

  &${({ $highlightAdd, $addAvatar }) => (($highlightAdd && $addAvatar) ? '' : ':hover')}, &:hover {
    background-color: ${({ theme }) => theme.palette.background.default};
    animation: ${backgroundColorShift} 5s infinite;
    animation-direction: alternate;
    animation-timing-function: cubic-bezier(0.4, 0, 1, 1);
    color: ${({ theme }) => theme.palette.common.black};
  }
  ${is('$addAvatar')`
    background-color: transparent;
  `}
`;

const AvatarPicture = styled('img', { shouldForwardProp: (property) => !/^\$/.test(String(property)) })<{ $large?: boolean }>`
  height: calc(36px - 2px);
  width: calc(36px - 2px);
  ${is('$large')`
    height: 44px;
    width: 44px;
  `}
`;

const ShortcutText = styled('p', { shouldForwardProp: (property) => !/^\$/.test(String(property)) })<{ $active?: boolean }>`
  margin-top: 2px;
  margin-bottom: 0;
  padding: 0;
  font-size: 12px;
  font-weight: 500;
  display: inline-block;
  word-break: break-all;
  text-align: center;
  ${is('$active')`
    text-decoration: underline;
    text-underline-offset: 0.2em;
  `}
`;
const Badge = styled(BadgeRaw)`
  line-height: 20px;
`;

interface Props {
  active?: boolean;
  badgeCount?: number;
  customIcon?: React.ReactElement;
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
  hibernated = false,
  showSideBarIcon = true,
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
      $large={!showSidebarTexts}
      $transparent={transparentBackground}
      $addAvatar={id === 'add'}
      $highlightAdd={index === 0}
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
          : customIcon || <AvatarPicture alt='Icon' $large={!showSidebarTexts} src={picturePath ? getAssetsFileUrl(picturePath) : defaultIcon} draggable={false} />)}
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
      $hibernated={hibernated}
      $active={active}
      $workspaceClickedLoading={workspaceClickedLoading}
      onClick={workspaceClickedLoading ? () => {} : onClick}
      data-testid={pageType ? `workspace-${pageType}` : `workspace-${id}`}
      data-active={active ? 'true' : 'false'}
      data-hibernated={hibernated ? 'true' : 'false'}
    >
      <Badge color='secondary' badgeContent={badgeCount} max={99}>
        {icon}
      </Badge>
      {showSidebarTexts && (
        <ShortcutText $active={active}>
          {workspaceName}
        </ShortcutText>
      )}
    </Root>
  );
}
