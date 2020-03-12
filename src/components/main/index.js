import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';

import CircularProgress from '@material-ui/core/CircularProgress';
import IconButton from '@material-ui/core/IconButton';
import Typography from '@material-ui/core/Typography';

import NotificationsIcon from '@material-ui/icons/Notifications';
import NotificationsPausedIcon from '@material-ui/icons/NotificationsPaused';
import SettingsIcon from '@material-ui/icons/Settings';

import { sortableContainer, sortableElement } from 'react-sortable-hoc';

import connectComponent from '../../helpers/connect-component';
import getWorkspacesAsList from '../../helpers/get-workspaces-as-list';

import WorkspaceSelector from './workspace-selector';
import FindInPage from './find-in-page';
import NavigationBar from './navigation-bar';
import FakeTitleBar from './fake-title-bar';

import arrowWhite from '../../images/arrow-white.png';
import arrowBlack from '../../images/arrow-black.png';

import {
  requestHibernateWorkspace,
  requestRemoveWorkspace,
  requestSetActiveWorkspace,
  requestSetWorkspace,
  requestShowAddWorkspaceWindow,
  requestShowEditWorkspaceWindow,
  requestShowLicenseRegistrationWindow,
  requestShowNotificationsWindow,
  requestShowPreferencesWindow,
  requestWakeUpWorkspace,
} from '../../senders';

const { remote } = window.require('electron');

const styles = (theme) => ({
  outerRoot: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    width: '100vw',
  },
  root: {
    display: 'flex',
    flexDirection: 'row',
    height: '100vh',
    width: '100vw',
    flex: 1,
  },
  sidebarRoot: {
    height: '100%',
    width: 68,
    borderRight: '1px solid rgba(0, 0, 0, 0.2)',
    backgroundColor: theme.palette.background.paper,
    WebkitAppRegion: 'drag',
    WebkitUserSelect: 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingBottom: theme.spacing(1),
    boxSizing: 'border-box',
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  sidebarTop: {
    flex: 1,
    paddingTop: window.process.platform === 'darwin' ? theme.spacing(3) : 0,
  },
  sidebarTopFullScreen: {
    paddingTop: 0,
  },
  innerContentRoot: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentRoot: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
  },
  arrow: {
    height: 202,
    width: 150,
    position: 'absolute',
    top: 50,
    left: 72,
    backgroundImage: `url('${theme.palette.type === 'dark' ? arrowWhite : arrowBlack}')`,
    backgroundSize: '150px 202px',
  },
  avatar: {
    fontFamily: theme.typography.fontFamily,
    display: 'inline-block',
    height: 32,
    width: 32,
    background: theme.palette.type === 'dark' ? theme.palette.common.white : theme.palette.common.black,
    borderRadius: 4,
    color: theme.palette.getContrastText(theme.palette.type === 'dark' ? theme.palette.common.white : theme.palette.common.black),
    lineHeight: '32px',
    textAlign: 'center',
    fontWeight: 500,
    textTransform: 'uppercase',
    marginLeft: theme.spacing(1),
    marginRight: theme.spacing(1),
    boxShadow: theme.shadows[1],
  },
  inlineBlock: {
    display: 'inline-block',
    fontSize: '18px',
    color: theme.palette.type === 'dark' ? theme.palette.common.white : theme.palette.common.black,
  },
  tip: {
    position: 'absolute',
    top: 112,
    left: 180,
    fontFamily: theme.typography.fontFamily,
    userSelect: 'none',
  },
  tip2: {
    fontFamily: theme.typography.fontFamily,
    userSelect: 'none',
  },
  grabbing: {
    cursor: 'grabbing !important',
    pointerEvents: 'auto !important',
  },
  end: {
    display: 'flex',
    flexDirection: 'column',
  },
});

const SortableItem = sortableElement(({ value }) => {
  const { index, workspace } = value;
  const {
    active, id, name, badgeCount, picturePath, hibernated, transparentBackground,
  } = workspace;
  return (
    <WorkspaceSelector
      active={active}
      id={id}
      key={id}
      name={name}
      badgeCount={badgeCount}
      picturePath={picturePath}
      transparentBackground={transparentBackground}
      order={index}
      onClick={() => requestSetActiveWorkspace(id)}
      onContextMenu={(e) => {
        e.preventDefault();

        const template = [
          {
            label: 'Edit Workspace',
            click: () => requestShowEditWorkspaceWindow(id),
          },
          {
            label: 'Remove Workspace',
            click: () => requestRemoveWorkspace(id),
          },
        ];

        if (!active) {
          template.splice(1, 0, {
            label: hibernated ? 'Wake Up Workspace' : 'Hibernate Workspace',
            click: () => {
              if (hibernated) {
                return requestWakeUpWorkspace(id);
              }
              return requestHibernateWorkspace(id);
            },
          });
        }

        const menu = remote.Menu.buildFromTemplate(template);

        menu.popup(remote.getCurrentWindow());
      }}
    />
  );
});

const SortableContainer = sortableContainer(({ children }) => <div>{children}</div>);

const Main = ({
  classes,
  didFailLoad,
  isFullScreen,
  isLoading,
  navigationBar,
  registered,
  shouldPauseNotifications,
  sidebar,
  titleBar,
  workspaces,
}) => {
  const workspacesList = getWorkspacesAsList(workspaces);
  const showTitleBar = titleBar || (window.mode !== 'menubar' && !navigationBar && !sidebar);

  return (
    <div className={classes.outerRoot}>
      {showTitleBar && (<FakeTitleBar />)}
      <div className={classes.root}>
        {sidebar && (
          <div className={classes.sidebarRoot}>
            <div className={classNames(classes.sidebarTop,
              (isFullScreen || showTitleBar || window.mode === 'menubar') && classes.sidebarTopFullScreen)}
            >
              <SortableContainer
                distance={10}
                helperClass={classes.grabbing}
                onSortEnd={({ oldIndex, newIndex }) => {
                  if (oldIndex === newIndex) return;
                  const oldWorkspace = workspacesList[oldIndex];
                  const newWorkspace = workspacesList[newIndex];
                  requestSetWorkspace(oldWorkspace.id, {
                    order: newWorkspace.order,
                  });
                  requestSetWorkspace(newWorkspace.id, {
                    order: oldWorkspace.order,
                  });
                }}
              >
                {workspacesList.map((workspace, i) => (
                  <SortableItem key={`item-${workspace.id}`} index={i} value={{ index: i, workspace }} />
                ))}
              </SortableContainer>
              <WorkspaceSelector
                id="add"
                onClick={() => {
                  if (!registered && Object.keys(workspaces).length > 1) {
                    requestShowLicenseRegistrationWindow();
                    return;
                  }
                  requestShowAddWorkspaceWindow();
                }}
              />
            </div>
            {!navigationBar && (
            <div className={classes.end}>
              <IconButton aria-label="Notifications" onClick={requestShowNotificationsWindow} className={classes.iconButton}>
                {shouldPauseNotifications ? <NotificationsPausedIcon /> : <NotificationsIcon />}
              </IconButton>
              {window.mode === 'menubar' && (
                <IconButton aria-label="Preferences" onClick={requestShowPreferencesWindow} className={classes.iconButton}>
                  <SettingsIcon />
                </IconButton>
              )}
            </div>
            )}
          </div>
        )}
        <div className={classes.contentRoot}>
          {navigationBar && <NavigationBar />}
          <FindInPage />
          <div className={classes.innerContentRoot}>
            {Object.keys(workspaces).length > 0 && didFailLoad && !isLoading && (
              <div>
                <Typography align="center" variant="h6">
                  This site can’t be reached.
                </Typography>

                <Typography align="center" variant="body2">
                  Try:
                  - Checking the network cables, modem, and router.
                  - Checking the proxy and the firewall.
                  - Reconnecting to Wi-Fi.
                </Typography>

                <Typography align="center" variant="body2">
                  Press ⌘ + R to reload.
                </Typography>
              </div>
            )}
            {Object.keys(workspaces).length > 0 && isLoading && <CircularProgress />}
            {Object.keys(workspaces).length < 1 && (
              <div>
                {sidebar ? (
                  <>
                    <div alt="Arrow" className={classes.arrow} />
                    <div className={classes.tip}>
                      <span className={classes.inlineBlock}>Click</span>
                      <div className={classes.avatar}>
                        +
                      </div>
                      <span className={classes.inlineBlock}>to get started!</span>
                    </div>
                  </>
                ) : (
                  <div className={classes.tip2}>
                    <span className={classes.inlineBlock}>
                      <span>Click </span>
                      <strong>Workspaces &gt; Add Workspace</strong>
                      <span> to get started!</span>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

Main.propTypes = {
  classes: PropTypes.object.isRequired,
  didFailLoad: PropTypes.bool.isRequired,
  isFullScreen: PropTypes.bool.isRequired,
  isLoading: PropTypes.bool.isRequired,
  navigationBar: PropTypes.bool.isRequired,
  registered: PropTypes.bool.isRequired,
  shouldPauseNotifications: PropTypes.bool.isRequired,
  sidebar: PropTypes.bool.isRequired,
  titleBar: PropTypes.bool.isRequired,
  workspaces: PropTypes.object.isRequired,
};

const mapStateToProps = (state) => ({
  didFailLoad: state.general.didFailLoad,
  isFullScreen: state.general.isFullScreen,
  isLoading: state.general.isLoading,
  navigationBar: (window.process.platform === 'linux'
    && state.preferences.attachToMenubar
    && !state.preferences.sidebar)
    || state.preferences.navigationBar,
  registered: state.preferences.registered,
  shouldPauseNotifications: state.notifications.pauseNotificationsInfo !== null,
  sidebar: state.preferences.sidebar,
  titleBar: state.preferences.titleBar,
  workspaces: state.workspaces,
});

export default connectComponent(
  Main,
  mapStateToProps,
  null,
  styles,
);
