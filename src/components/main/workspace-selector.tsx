import React, { useState, useEffect } from 'react';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import Badge from '@material-ui/core/Badge';
import connectComponent from '../../helpers/connect-component';
import { getBaseName } from '@/senders';
// @ts-expect-error ts-migrate(2307) FIXME: Cannot find module '../../images/default-icon.png'... Remove this comment to see the full error message
import defaultIcon from '../../images/default-icon.png';
const styles = (theme: any) => ({
  root: {
    height: 'fit-content',
    width: 68,
    padding: '10px 0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    fontFamily: theme.typography.fontFamily,
    outline: 'none',
    '&:hover': {
      background: theme.palette.action.hover,
      cursor: 'pointer',
      opacity: 1,
    },
    WebkitAppRegion: 'no-drag',
    opacity: 0.8,
    position: 'relative',
    borderLeft: '4px solid',
    borderColor: 'transparent',
  },
  rootHibernate: {
    opacity: 0.4,
  },
  rootActive: {
    borderColor: theme.palette.type === 'dark' ? theme.palette.common.white : theme.palette.common.black,
    opacity: 1,
  },
  avatar: {
    height: 36,
    width: 36,
    background: theme.palette.type === 'dark' ? theme.palette.common.black : theme.palette.common.white,
    borderRadius: 4,
    color: theme.palette.getContrastText(theme.palette.type === 'dark' ? theme.palette.common.black : theme.palette.common.white),
    lineHeight: '36px',
    textAlign: 'center',
    fontWeight: 500,
    textTransform: 'uppercase',
    border: theme.palette.type === 'dark' ? 'none' : '1px solid rgba(0, 0, 0, 0.12)',
    overflow: 'hidden',
  },
  avatarLarge: {
    height: 44,
    width: 44,
    lineHeight: '44px',
  },
  avatarPicture: {
    height: 36 - 2,
    width: 36 - 2,
  },
  avatarPictureLarge: {
    height: 44,
    width: 44,
  },
  transparentAvatar: {
    background: 'transparent',
    border: 'none',
    borderRadius: 0,
  },
  addAvatar: {
    background: theme.palette.type === 'dark' ? theme.palette.common.white : theme.palette.common.black,
    color: theme.palette.getContrastText(theme.palette.type === 'dark' ? theme.palette.common.white : theme.palette.common.black),
  },
  shortcutText: {
    marginTop: 2,
    marginBottom: 0,
    padding: 0,
    fontSize: '12px',
    fontWeight: 500,
    display: 'inline-block',
    wordBreak: 'break-all',
    color: theme.palette.text.primary,
  },
  badge: {
    lineHeight: '20px',
  },
});
interface Props {
  active: boolean;
  badgeCount: number;
  classes: Object;
  hibernated: boolean;
  id: string;
  onClick: Function;
  onContextMenu: Function;
  order: number;
  picturePath: string;
  sidebarShortcutHints: boolean;
  transparentBackground: boolean;
  workspaceName: string;
}
function WorkspaceSelector({
  active = false,
  badgeCount = 0,
  classes,
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
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      shortWorkspaceNameSetter(workspaceName ? await getBaseName(workspaceName) : t('WorkspaceSelector.BadWorkspacePath'));
    });
  }, []);
  return (
    <div
      role="button"
      className={classNames((classes as any).root, hibernated && (classes as any).rootHibernate, active && (classes as any).rootActive)}
      // @ts-expect-error ts-migrate(2322) FIXME: Type 'Function' is not assignable to type '(event:... Remove this comment to see the full error message
      onClick={onClick}
      // @ts-expect-error ts-migrate(2322) FIXME: Type 'Function' is not assignable to type '(event:... Remove this comment to see the full error message
      onKeyDown={onClick}
      // @ts-expect-error ts-migrate(2322) FIXME: Type 'Function' is not assignable to type '(event:... Remove this comment to see the full error message
      onContextMenu={onContextMenu}
      // @ts-expect-error ts-migrate(2322) FIXME: Type 'string' is not assignable to type 'number | ... Remove this comment to see the full error message
      tabIndex="0">
      <Badge color="secondary" badgeContent={badgeCount} max={99} classes={{ badge: (classes as any).badge }}>
        <div
          className={classNames(
            (classes as any).avatar,
            !sidebarShortcutHints && (classes as any).avatarLarge,
            transparentBackground && (classes as any).transparentAvatar,
            id === 'add' && (classes as any).addAvatar,
          )}>
          {id !== 'add' ? (
            <img
              alt="Icon"
              className={classNames((classes as any).avatarPicture, !sidebarShortcutHints && (classes as any).avatarPictureLarge)}
              src={picturePath ? `file:///${picturePath}` : defaultIcon}
              draggable={false}
            />
          ) : (
            '+'
          )}
        </div>
      </Badge>
      {sidebarShortcutHints && (id === 'add' || order < 9) && (
        <p className={(classes as any).shortcutText}>{id === 'add' ? t('WorkspaceSelector.Add') : shortWorkspaceName}</p>
      )}
    </div>
  );
}
const mapStateToProps = (state: any, ownProps: any) => {
  return {
    badgeCount: state.workspaceMetas[ownProps.id] ? state.workspaceMetas[ownProps.id].badgeCount : 0,
    workspaceName: state.workspaces?.[ownProps.id]?.name,
    sidebarShortcutHints: state.preferences.sidebarShortcutHints,
  };
};
export default connectComponent(WorkspaceSelector, mapStateToProps, undefined, styles);
