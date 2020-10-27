// @flow
import React from 'react';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';

import Badge from '@material-ui/core/Badge';

import connectComponent from '../../helpers/connect-component';
import { getBaseName } from '../../senders';

import defaultIcon from '../../images/default-icon.png';

const styles = theme => ({
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
    color: theme.palette.getContrastText(
      theme.palette.type === 'dark' ? theme.palette.common.black : theme.palette.common.white,
    ),
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
    color: theme.palette.getContrastText(
      theme.palette.type === 'dark' ? theme.palette.common.white : theme.palette.common.black,
    ),
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

type Props = {
  active: boolean,
  badgeCount: number,
  classes: Object,
  hibernated: boolean,
  id: string,
  onClick: Function,
  onContextMenu: Function,
  order: number,
  picturePath: string,
  sidebarShortcutHints: boolean,
  transparentBackground: boolean,
  workspaceName?: string,
};

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

  const shortWorkspaceName = workspaceName ? getBaseName(workspaceName) : t('WorkspaceSelector.BadWorkspacePath');
  return (
    <div
      role="button"
      className={classNames(classes.root, hibernated && classes.rootHibernate, active && classes.rootActive)}
      onClick={onClick}
      onKeyDown={onClick}
      onContextMenu={onContextMenu}
      tabIndex="0"
    >
      <Badge color="secondary" badgeContent={badgeCount} max={99} classes={{ badge: classes.badge }}>
        <div
          className={classNames(
            classes.avatar,
            !sidebarShortcutHints && classes.avatarLarge,
            transparentBackground && classes.transparentAvatar,
            id === 'add' && classes.addAvatar,
          )}
        >
          {id !== 'add' ? (
            <img
              alt="Icon"
              className={classNames(classes.avatarPicture, !sidebarShortcutHints && classes.avatarPictureLarge)}
              src={picturePath ? `file:///${picturePath}` : defaultIcon}
              draggable={false}
            />
          ) : (
            '+'
          )}
        </div>
      </Badge>
      {sidebarShortcutHints && (id === 'add' || order < 9) && (
        <p className={classes.shortcutText}>{id === 'add' ? t('WorkspaceSelector.Add') : shortWorkspaceName}</p>
      )}
    </div>
  );
}

const mapStateToProps = (state, ownProps) => {
  return {
    badgeCount: state.workspaceMetas[ownProps.id] ? state.workspaceMetas[ownProps.id].badgeCount : 0,
    workspaceName: state.workspaces?.[ownProps.id]?.name,
    sidebarShortcutHints: state.preferences.sidebarShortcutHints,
  };
};

export default connectComponent(WorkspaceSelector, mapStateToProps, undefined, styles);
