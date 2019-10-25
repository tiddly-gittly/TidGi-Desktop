import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';

import CircularProgress from '@material-ui/core/CircularProgress';
import IconButton from '@material-ui/core/IconButton';
import Typography from '@material-ui/core/Typography';

import SettingsIcon from '@material-ui/icons/SettingsSharp';

import { sortableContainer, sortableElement } from 'react-sortable-hoc';

import connectComponent from '../../helpers/connect-component';
import getWorkspacesAsList from '../../helpers/get-workspaces-as-list';

import WorkspaceSelector from './workspace-selector';
import FindInPage from './find-in-page';
import NavigationBar from './navigation-bar';

import arrowWhite from '../../images/arrow-white.png';
import arrowBlack from '../../images/arrow-black.png';

import {
  requestRemoveWorkspace,
  requestSetActiveWorkspace,
  requestSetWorkspace,
  requestShowAddWorkspaceWindow,
  requestShowEditWorkspaceWindow,
  requestShowLicenseRegistrationWindow,
  requestShowPreferencesWindow,
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
    height: '100vh',
    width: 68,
    borderRight: '1px solid rgba(0, 0, 0, 0.2)',
    backgroundColor: theme.palette.background.paper,
    WebkitAppRegion: 'drag',
    WebkitUserSelect: 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingBottom: theme.spacing.unit,
    boxSizing: 'border-box',
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  sidebarTop: {
    flex: 1,
    paddingTop: window.process.platform === 'darwin' ? theme.spacing.unit * 3 : 0,
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
    marginLeft: theme.spacing.unit,
    marginRight: theme.spacing.unit,
    boxShadow: 'rgba(0, 0, 0, 0.16) 0px 1px 2px, rgba(0, 0, 0, 0.23) 0px 1px 2px',
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
  },
  grabbing: {
    cursor: 'grabbing !important',
    pointerEvents: 'auto !important',
  },
});

const SortableItem = sortableElement(({ value }) => {
  const { index, workspace } = value;
  const {
    active, id, name, badgeCount, picturePath,
  } = workspace;
  return (
    <WorkspaceSelector
      active={active}
      id={id}
      key={id}
      name={name}
      badgeCount={badgeCount}
      picturePath={picturePath}
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
  workspaces,
}) => {
  const workspacesList = getWorkspacesAsList(workspaces);
  return (
    <div className={classes.outerRoot}>
      <div className={classes.root}>
        <div className={classes.sidebarRoot}>
          <div className={classNames(classes.sidebarTop,
            isFullScreen && classes.sidebarTopFullScreen)}
          >
            <SortableContainer
              pressDelay={250}
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
            <IconButton aria-label="Preferences" onClick={requestShowPreferencesWindow}>
              <SettingsIcon />
            </IconButton>
          </div>
          )}
        </div>
        <div className={classes.contentRoot}>
          {navigationBar && <NavigationBar />}
          <FindInPage />
          <div className={classes.innerContentRoot}>
            {Object.keys(workspaces).length > 0 && didFailLoad && !isLoading && (
              <div>
                <Typography align="center" variant="h6">
                  No internet
                </Typography>

                <Typography align="center" variant="body1">
                  Try: - Checking the network cables, modem, and router. - Reconnecting to Wi-Fi.
                </Typography>

                <Typography align="center" variant="body1">
                  Press ⌘ + R to reload.
                </Typography>
              </div>
            )}
            {Object.keys(workspaces).length > 0 && isLoading && <CircularProgress />}
            {Object.keys(workspaces).length < 1 && (
              <div>
                <div alt="Arrow" className={classes.arrow} />
                <div className={classes.tip}>
                  <span className={classes.inlineBlock}>Click</span>
                  <div className={classes.avatar}>
                    +
                  </div>
                  <span className={classes.inlineBlock}>to get started!</span>
                </div>
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
  workspaces: PropTypes.object.isRequired,
};

const mapStateToProps = (state) => ({
  didFailLoad: state.general.didFailLoad,
  isFullScreen: state.general.isFullScreen,
  isLoading: state.general.isLoading,
  navigationBar: state.preferences.navigationBar,
  registered: state.preferences.registered,
  workspaces: state.workspaces,
});

export default connectComponent(
  Main,
  mapStateToProps,
  null,
  styles,
);
