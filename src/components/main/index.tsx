import React from 'react';
import classNames from 'classnames';
import { withTranslation } from 'react-i18next';

import SimpleBar from 'simplebar-react';
import 'simplebar/dist/simplebar.min.css';

import Button from '@material-ui/core/Button';
import IconButton from '@material-ui/core/IconButton';
import Typography from '@material-ui/core/Typography';

import NotificationsIcon from '@material-ui/icons/Notifications';
import NotificationsPausedIcon from '@material-ui/icons/NotificationsPaused';
import SettingsIcon from '@material-ui/icons/Settings';

// @ts-expect-error ts-migrate(2724) FIXME: '"../../../node_modules/react-sortable-hoc/types"'... Remove this comment to see the full error message
import { sortableContainer, sortableElement } from 'react-sortable-hoc';

import connectComponent from '../../helpers/connect-component';
import getWorkspacesAsList from '../../helpers/get-workspaces-as-list';

// @ts-expect-error ts-migrate(6142) FIXME: Module './workspace-selector' was resolved to '/Us... Remove this comment to see the full error message
import WorkspaceSelector from './workspace-selector';
// @ts-expect-error ts-migrate(6142) FIXME: Module './find-in-page' was resolved to '/Users/li... Remove this comment to see the full error message
import FindInPage from './find-in-page';
// @ts-expect-error ts-migrate(6142) FIXME: Module './navigation-bar' was resolved to '/Users/... Remove this comment to see the full error message
import NavigationBar from './navigation-bar';
// @ts-expect-error ts-migrate(6142) FIXME: Module './fake-title-bar' was resolved to '/Users/... Remove this comment to see the full error message
import FakeTitleBar from './fake-title-bar';
// @ts-expect-error ts-migrate(6142) FIXME: Module './draggable-region' was resolved to '/User... Remove this comment to see the full error message
import DraggableRegion from './draggable-region';

// @ts-expect-error ts-migrate(2307) FIXME: Cannot find module '../../images/arrow-white.png' ... Remove this comment to see the full error message
import arrowWhite from '../../images/arrow-white.png';
// @ts-expect-error ts-migrate(2307) FIXME: Cannot find module '../../images/arrow-black.png' ... Remove this comment to see the full error message
import arrowBlack from '../../images/arrow-black.png';

import {
  requestHibernateWorkspace,
  requestRemoveWorkspace,
  requestSetActiveWorkspace,
  requestSetWorkspaces,
  requestShowAddWorkspaceWindow,
  requestShowEditWorkspaceWindow,
  requestShowNotificationsWindow,
  requestShowPreferencesWindow,
  requestWakeUpWorkspace,
  requestReload,
  requestOpen,
  getLogFolderPath,
  requestOpenTiddlerInWiki,
  requestWikiSendActionMessage,
  requestGetActiveWorkspace,
} from '../../senders';

// https://github.com/sindresorhus/array-move/blob/master/index.js
const arrayMove = (array: any, from: any, to: any) => {
  const newArray = array.slice();
  const startIndex = to < 0 ? newArray.length + to : to;
  const item = newArray.splice(from, 1)[0];
  newArray.splice(startIndex, 0, item);
  return newArray;
};

const styles = (theme: any) => ({
  outerRoot: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    width: '100vw',
    overflow: 'hidden',
  },

  root: {
    display: 'flex',
    flexDirection: 'row',
    flex: 1,
    height: '100%',
    width: '100%',
    overflow: 'hidden',
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
    paddingTop: window.remote.getPlatform() === 'darwin' ? theme.spacing(3) : 0,
  },

  sidebarTopFullScreen: {
    paddingTop: 0,
  },

  innerContentRoot: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing(1),
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
    border: theme.palette.type === 'dark' ? 'none' : '1px solid rgba(0, 0, 0, 0.12)',
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

  ul: {
    marginTop: 0,
    marginBottom: '1.5rem',
  },
});

const SortableItem = withTranslation()(
  sortableElement(({ value, t }: any) => {
    const { index, workspace } = value;
    const { active, id, name, picturePath, hibernated, transparentBackground, isSubWiki, tagName } = workspace;
    return (
      // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <WorkspaceSelector
        active={active}
        id={id}
        key={id}
        name={name}
        picturePath={picturePath}
        transparentBackground={transparentBackground}
        order={index}
        hibernated={hibernated}
        onClick={() => {
          if (isSubWiki) {
            requestOpenTiddlerInWiki(tagName);
          } else {
            const activeWorkspace = requestGetActiveWorkspace();
            if (activeWorkspace.id === id) {
              requestWikiSendActionMessage('tm-home');
            } else {
              requestSetActiveWorkspace(id);
            }
          }
        }}
        onContextMenu={(event: any) => {
          event.preventDefault();

          const template = [
            {
              label: t('WorkspaceSelector.EditWorkspace'),
              click: () => requestShowEditWorkspaceWindow(id),
            },
            {
              label: t('WorkspaceSelector.RemoveWorkspace'),
              click: () => requestRemoveWorkspace(id),
            },
          ];

          if (!active && !isSubWiki) {
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

          window.remote.menu.buildFromTemplateAndPopup(template);
        }}
      />
    );
  }),
);

// @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
const SortableContainer = sortableContainer(({ children }: any) => <div>{children}</div>);

interface SidebarContainerProps {
  className: string;
  children: React.ReactNode;
}

const SidebarContainer = ({ className, children }: SidebarContainerProps) => {
  // use native scroll bar on macOS
  if (window.remote.getPlatform() === 'darwin') {
    // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    return <div className={className}>{children}</div>;
  }
  // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return <SimpleBar className={className}>{children}</SimpleBar>;
};

interface OwnMainProps {
  classes: any;
  didFailLoad?: string;
  isFullScreen: boolean;
  isLoading?: boolean;
  navigationBar: boolean;
  shouldPauseNotifications: boolean;
  sidebar: boolean;
  titleBar: boolean;
  workspaces: any;
}

// @ts-expect-error ts-migrate(2456) FIXME: Type alias 'MainProps' circularly references itsel... Remove this comment to see the full error message
type MainProps = OwnMainProps & typeof Main.defaultProps;

// @ts-expect-error ts-migrate(7022) FIXME: 'Main' implicitly has type 'any' because it does n... Remove this comment to see the full error message
const Main = ({ classes, didFailLoad, isFullScreen, isLoading, navigationBar, shouldPauseNotifications, sidebar, titleBar, workspaces }: MainProps) => {
  const workspacesList = getWorkspacesAsList(workspaces);
  const showTitleBar = window.remote.getPlatform() === 'darwin' && titleBar && !isFullScreen;

  return (
    // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className={classes.outerRoot}>
      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      {workspacesList.length > 0 && <DraggableRegion />}
      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      {showTitleBar && <FakeTitleBar />}
      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className={classes.root}>
        {sidebar && (
          // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <SidebarContainer className={classes.sidebarRoot}>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className={classNames(classes.sidebarTop, (isFullScreen || showTitleBar || window.meta.mode === 'menubar') && classes.sidebarTopFullScreen)}>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <SortableContainer
                distance={10}
                helperClass={classes.grabbing}
                onSortEnd={({ oldIndex, newIndex }: any) => {
                  if (oldIndex === newIndex) return;

                  const newWorkspacesList = arrayMove(workspacesList, oldIndex, newIndex);
                  const newWorkspaces = { ...workspaces };
                  newWorkspacesList.forEach((workspace: any, index: any) => {
                    newWorkspaces[workspace.id].order = index;
                  });

                  requestSetWorkspaces(newWorkspaces);
                }}>
                {workspacesList.map((workspace, index) => (
                  // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  <SortableItem key={`item-${workspace.id}`} index={index} value={{ index: index, workspace }} />
                ))}
              </SortableContainer>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <WorkspaceSelector id="add" onClick={() => requestShowAddWorkspaceWindow()} />
            </div>
            {!navigationBar && (
              // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <div className={classes.end}>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <IconButton aria-label="Notifications" onClick={requestShowNotificationsWindow} className={classes.iconButton}>
                  {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  {shouldPauseNotifications ? <NotificationsPausedIcon /> : <NotificationsIcon />}
                </IconButton>
                {window.meta.mode === 'menubar' && (
                  // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  <IconButton aria-label="Preferences" onClick={() => requestShowPreferencesWindow()} className={classes.iconButton}>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <SettingsIcon />
                  </IconButton>
                )}
              </div>
            )}
          </SidebarContainer>
        )}
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className={classes.contentRoot}>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          {navigationBar && <NavigationBar />}
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <FindInPage />
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className={classes.innerContentRoot}>
            {Object.keys(workspaces).length > 0 && didFailLoad && !isLoading && (
              // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <div>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Typography align="left" variant="h5">
                  Wiki is not started or not loaded
                </Typography>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Typography align="left" variant="body2">
                  {didFailLoad}
                </Typography>

                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <br />
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Typography align="left" variant="body2">
                  {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <>
                    Try:
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <ul className={classes.ul}>
                      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <li>
                        Click{' '}
                        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <b onClick={requestReload} onKeyPress={requestReload} role="button" tabIndex="0" style={{ cursor: 'pointer' }}>
                          Reload
                        </b>{' '}
                        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        button below or press <b>CMD_or_Ctrl + R</b> to reload the page.
                      </li>
                      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <li>
                        Check the{' '}
                        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <b
                          onClick={() => requestOpen(getLogFolderPath(), true)}
                          onKeyPress={() => requestOpen(getLogFolderPath(), true)}
                          role="button"
                          // @ts-expect-error ts-migrate(2322) FIXME: Type 'string' is not assignable to type 'number | ... Remove this comment to see the full error message
                          tabIndex="0"
                          style={{ cursor: 'pointer' }}>
                          Log Folder
                        </b>{' '}
                        to see what happened.
                      </li>
                      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <li>Backup your file, remove workspace and recreate one.</li>
                    </ul>
                  </>
                </Typography>

                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Button variant="outlined" onClick={requestReload}>
                  Reload
                </Button>
              </div>
            )}
            {Object.keys(workspaces).length > 0 && isLoading && (
              // @ts-expect-error ts-migrate(2769) FIXME: No overload matches this call.
              <Typography type="body1" color="textSecondary">
                Loading..
              </Typography>
            )}
            {Object.keys(workspaces).length < 1 && (
              // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <div>
                {sidebar ? (
                  // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  <>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <div alt="Arrow" className={classes.arrow} />
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <div className={classes.tip}>
                      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <span className={classes.inlineBlock}>Click</span>
                      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <div className={classes.avatar}>+</div>
                      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <span className={classes.inlineBlock}>to get started!</span>
                    </div>
                  </>
                ) : (
                  // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  <div className={classes.tip2}>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span className={classes.inlineBlock}>
                      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <span>Click </span>
                      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <strong>Workspaces &gt; Add Workspace</strong>
                      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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

Main.defaultProps = {
  isLoading: false,
};

const mapStateToProps = (state: any) => {
  // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
  const activeWorkspace = Object.values(state.workspaces).find((workspace) => workspace.active);

  return {
    // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
    didFailLoad: activeWorkspace && state.workspaceMetas[activeWorkspace.id] ? state.workspaceMetas[activeWorkspace.id].didFailLoad : undefined,
    isFullScreen: state.general.isFullScreen,
    // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
    isLoading: activeWorkspace && state.workspaceMetas[activeWorkspace.id] ? Boolean(state.workspaceMetas[activeWorkspace.id].isLoading) : false,
    navigationBar:
      (window.remote.getPlatform() === 'linux' && state.preferences.attachToMenubar && !state.preferences.sidebar) || state.preferences.navigationBar,
    shouldPauseNotifications: state.notifications.pauseNotificationsInfo !== null,
    sidebar: state.preferences.sidebar,
    titleBar: state.preferences.titleBar,
    workspaces: state.workspaces,
  };
};

export default connectComponent(Main, mapStateToProps, undefined, styles);
