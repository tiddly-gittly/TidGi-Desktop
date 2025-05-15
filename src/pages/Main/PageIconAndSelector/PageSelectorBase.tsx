import BadgeRaw from '@mui/material/Badge';
import { PageType } from '@services/pages/interface';
import Promise from 'bluebird';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { keyframes, styled } from 'styled-components';
import is from 'typescript-styled-is';

Promise.config({ cancellation: true });

const Root = styled.div<{ $active?: boolean; $pageClickedLoading?: boolean }>`
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
  ${is('$active')`
    opacity: 1;
  `}
  box-sizing: border-box;
  border-left: 3px solid ${({ $active, theme }) => ($active === true ? theme.palette.text.primary : 'transparent')};
  ${is('$pageClickedLoading')`
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
  $addAvatar: boolean;
  $highlightAdd: boolean;
  $large?: boolean;
  $transparent?: boolean;
}
const Avatar = styled.div<IAvatarProps>`
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

  &${({ $highlightAdd, $addAvatar }) => ($highlightAdd && $addAvatar ? '' : ':hover')}, &:hover {
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

const AvatarPicture = styled.div<{ $large?: boolean }>`
  height: calc(36px - 2px);
  width: calc(36px - 2px);
  ${is('$large')`
    height: 44px;
    width: 44px;
  `}
  & svg {
    margin-top: 5%;
    width: 90%;
    height: 90%;
  }
`;

const ShortcutText = styled.p<{ $active?: boolean }>`
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
  icon: React.ReactNode;
  id: PageType;
  index?: number;
  onClick?: () => void;
  pageClickedLoading?: boolean;
  pageName?: string;
  picturePath?: string | null;
  showSideBarIcon: boolean;
  showSidebarTexts?: boolean;
}
export function PageSelectorBase({
  active = false,
  badgeCount = 0,
  showSideBarIcon = true,
  id,
  index = 0,
  showSidebarTexts = true,
  pageName,
  pageClickedLoading = false,
  onClick = () => {},
  icon,
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  useEffect(() => {
  }, [id, pageName, t]);
  let displayName = pageName;
  switch (id) {
    case PageType.guide: {
      displayName = t('WorkspaceSelector.Guide');
      break;
    }
    case PageType.help: {
      displayName = t('WorkspaceSelector.Help');
      break;
    }
    case PageType.agent: {
      displayName = t('WorkspaceSelector.Agent');
      break;
    }
  }
  return (
    <Root
      $active={active}
      $pageClickedLoading={pageClickedLoading}
      onClick={pageClickedLoading ? () => {} : onClick}
    >
      <Badge color='secondary' badgeContent={badgeCount} max={99}>
        {showSideBarIcon && (
          <Avatar
            $large={!showSidebarTexts}
            $addAvatar={false}
            $highlightAdd={index === 0}
            id={`workspace-avatar-${id}`}
          >
            <AvatarPicture $large={!showSidebarTexts} draggable={false}>
              {icon}
            </AvatarPicture>
          </Avatar>
        )}
      </Badge>
      {showSidebarTexts && (
        <ShortcutText $active={active}>
          {displayName}
        </ShortcutText>
      )}
    </Root>
  );
}
