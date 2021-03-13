import Promise from 'bluebird';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import BadgeRaw from '@material-ui/core/Badge';
import styled, { css } from 'styled-components';

import defaultIcon from '../../images/default-icon.png';

Promise.config({ cancellation: true });

// TODO: &:hover { background: theme.palette.action.hover;
const Root = styled.div<{ hibernated?: boolean; active?: boolean }>`
  height: fit-content;
  width: 68px;
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
  opacity: 0.8;
  position: relative;
  border-left: 4px solid;
  border-color: transparent;
  ${({ hibernated }) =>
    hibernated &&
    css`
      opacity: 0.4;
    `}
  ${({ active }) =>
    active &&
    css`
      opacity: 1;
    `}
`;

// TODO: borderColor: theme.palette.type === 'dark' ? theme.palette.common.white : theme.palette.common.black;
const RootActive = styled.div``;

// TODO: background: theme.palette.type === 'dark' ? theme.palette.common.black : theme.palette.common.white,
// TODO: color: theme.palette.getContrastText(theme.palette.type === 'dark' ? theme.palette.common.black : theme.palette.common.white),
// TODO: border: theme.palette.type === 'dark' ? 'none' : 1px solid rgba(0, 0, 0, 0.12),
const Avatar = styled.div<{ large?: boolean; transparent?: boolean; addAvatar?: boolean }>`
  height: 36px;
  width: 36px;
  border-radius: 4px;
  line-height: 36px;
  text-align: center;
  font-weight: 500;
  text-transform: uppercase;
  overflow: hidden;
  ${({ large }) =>
    large &&
    css`
      height: 44px;
      width: 44px;
      line-height: 44px;
    `}
  ${({ transparent }) =>
    transparent &&
    css`
      background: transparent;
      border: none;
      border-radius: 0;
    `}
`;

const AvatarPicture = styled.img<{ large?: boolean }>`
  height: calc(36px - 2px);
  width: calc(36px - 2px);
  ${({ large }) =>
    large &&
    css`
      height: 44px;
      width: 44px;
    `}
`;

// TODO: background: theme.palette.type === 'dark' ? theme.palette.common.white : theme.palette.common.black;
// TODO: color: theme.palette.getContrastText(theme.palette.type === 'dark' ? theme.palette.common.white : theme.palette.common.black);
const AddAvatar = styled.div``;
// TODO:  color: theme.palette.text.primary;
const ShortcutText = styled.p`
  margin-top: 2px;
  margin-bottom: 0;
  padding: 0;
  font-size: 12px;
  font-weight: 500;
  display: inline-block;
  word-break: break-all;
`;
const Badge = styled(BadgeRaw)`
  line-height: 20px;
`;

interface Props {
  active?: boolean;
  badgeCount?: number;
  hibernated?: boolean;
  id: string;
  onClick?: () => void;
  onContextMenu?: () => void;
  order?: number;
  picturePath?: string;
  sidebarShortcutHints?: boolean;
  transparentBackground?: boolean;
  workspaceName?: string;
}
export default function WorkspaceSelector({
  active = false,
  badgeCount = 0,
  hibernated = false,
  id,
  onClick = () => {},
  onContextMenu = () => {},
  order = 0,
  picturePath,
  sidebarShortcutHints,
  transparentBackground = false,
  workspaceName,
}: Props) {
  const { t } = useTranslation();
  const [shortWorkspaceName, shortWorkspaceNameSetter] = useState<string>(t('Loading'));
  useEffect(() => {
    const baseName = window.remote.getBaseName(workspaceName);
    shortWorkspaceNameSetter(baseName !== undefined ? baseName : t('WorkspaceSelector.BadWorkspacePath'));
  }, [workspaceName]);
  return (
    <Root role="button" hibernated={hibernated} active={active} onClick={onClick} onKeyDown={onClick} onContextMenu={onContextMenu} tabIndex={0}>
      <Badge color="secondary" badgeContent={badgeCount} max={99}>
        <Avatar large={!sidebarShortcutHints} transparent={transparentBackground} addAvatar={id === 'add'}>
          {id !== 'add' ? (
            <AvatarPicture alt="Icon" large={!sidebarShortcutHints} src={picturePath ? `file:///${picturePath}` : defaultIcon} draggable={false} />
          ) : (
            '+'
          )}
        </Avatar>
      </Badge>
      {sidebarShortcutHints && (id === 'add' || order < 9) && <ShortcutText>{id === 'add' ? t('WorkspaceSelector.Add') : shortWorkspaceName}</ShortcutText>}
    </Root>
  );
}
