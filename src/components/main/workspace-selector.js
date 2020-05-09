import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';

import Badge from '@material-ui/core/Badge';

import connectComponent from '../../helpers/connect-component';

import defaultIcon from '../../images/default-icon.png';

const styles = (theme) => ({
  root: {
    height: 68,
    width: 68,
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
    height: 32,
    width: 32,
    background: theme.palette.type === 'dark' ? theme.palette.common.black : theme.palette.common.white,
    borderRadius: 4,
    color: theme.palette.getContrastText(theme.palette.type === 'dark' ? theme.palette.common.black : theme.palette.common.white),
    lineHeight: '32px',
    textAlign: 'center',
    fontWeight: 500,
    textTransform: 'uppercase',
    border: theme.palette.type === 'dark' ? 'none' : '1px solid rgba(0, 0, 0, 0.12)',
    overflow: 'hidden',
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
  avatarPicture: {
    height: '100%',
    width: '100%',
  },
  shortcutText: {
    marginTop: 2,
    marginBottom: 0,
    padding: 0,
    fontSize: '12px',
    fontWeight: 500,
    color: theme.palette.text.primary,
  },
  badge: {
    lineHeight: '20px',
  },
});

const WorkspaceSelector = ({
  active,
  badgeCount,
  classes,
  hibernated,
  id,
  onClick,
  onContextMenu,
  order,
  picturePath,
  transparentBackground,
}) => (
  <div
    role="button"
    className={classNames(
      classes.root,
      hibernated && classes.rootHibernate,
      active && classes.rootActive,
    )}
    onClick={onClick}
    onKeyDown={null}
    onContextMenu={onContextMenu}
    tabIndex="0"
  >
    <Badge color="secondary" badgeContent={badgeCount} max={99} classes={{ badge: classes.badge }}>
      <div
        className={classNames(
          classes.avatar,
          transparentBackground && classes.transparentAvatar,
          id === 'add' && classes.addAvatar,
        )}
      >
        {id !== 'add' ? (
          <img alt="Icon" className={classes.avatarPicture} src={picturePath ? `file://${picturePath}` : defaultIcon} draggable={false} />
        ) : '+'}
      </div>
    </Badge>
    {(id === 'add' || order < 9) && (
      <p className={classes.shortcutText}>{id === 'add' ? 'Add' : `${window.process.platform === 'darwin' ? '⌘' : 'Ctrl'} + ${order + 1}`}</p>
    )}
  </div>
);

WorkspaceSelector.defaultProps = {
  active: false,
  badgeCount: 0,
  hibernated: false,
  onContextMenu: null,
  order: 0,
  picturePath: null,
  transparentBackground: false,
};

WorkspaceSelector.propTypes = {
  active: PropTypes.bool,
  badgeCount: PropTypes.number,
  classes: PropTypes.object.isRequired,
  hibernated: PropTypes.bool,
  id: PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
  onContextMenu: PropTypes.func,
  order: PropTypes.number,
  picturePath: PropTypes.string,
  transparentBackground: PropTypes.bool,
};

export default connectComponent(
  WorkspaceSelector,
  null,
  null,
  styles,
);
