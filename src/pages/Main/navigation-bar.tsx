import React, { useState } from 'react';
import classNames from 'classnames';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import ArrowForwardIcon from '@material-ui/icons/ArrowForward';
import HomeIcon from '@material-ui/icons/Home';
import IconButton from '@material-ui/core/IconButton';
import NotificationsIcon from '@material-ui/icons/Notifications';
import NotificationsPausedIcon from '@material-ui/icons/NotificationsPaused';
import RefreshIcon from '@material-ui/icons/Refresh';
import SettingsIcon from '@material-ui/icons/SettingsSharp';
import InputBase from '@material-ui/core/InputBase';

import { WindowNames } from '@services/windows/WindowProperties';
import connectComponent from '../../helpers/connect-component';
import isUrl from '../../helpers/is-url';
import { updateAddressBarInfo } from '../../state/general/actions';
const styles = (theme: any) => ({
  root: {
    width: '100%',
    height: 36,
    backgroundColor: theme.palette.background.paper,
    borderBottom: '1px solid rgba(0, 0, 0, 0.2)',
    display: 'flex',
    alignItems: 'center',
    paddingLeft: theme.spacing(1),
    paddingRight: theme.spacing(1),
    WebkitAppRegion: 'drag',
    WebkitUserSelect: 'none',
  },
  rootWithTrafficLights: {
    paddingLeft: 68 + theme.spacing(1),
  },
  center: {
    flex: 1,
    paddingLeft: theme.spacing(1),
    paddingRight: theme.spacing(1),
  },
  iconButton: {
    padding: 6,
  },
  icon: {
    fontSize: '18px',
  },
  addressBarRoot: {
    width: '100%',
    background: theme.palette.background.default,
    borderRadius: 16,
    WebkitAppRegion: 'none',
    WebkitUserSelect: 'text',
  },
  addressBarInput: {
    fontSize: '0.8em',
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 4,
    paddingBottom: 4,
  },
  goButton: {
    padding: 4,
  },
});
const processUrl = (url: any) => {
  if (!url) {
    return url;
  }
  if (isUrl(url)) {
    return url;
  }
  const httpUrl = `http://${url}`;
  if (/[\dA-Za-z]+(\.[\dA-Za-z]+)+/.test(url) && isUrl(httpUrl)) {
    // match common url format
    return httpUrl;
  }
  const processedUrl = `http://google.com/search?q=${encodeURIComponent(url)}`;
  return processedUrl;
};
interface OwnNavigationBarProps {
  address?: string;
  addressEdited: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  classes: any;
  hasTrafficLights: boolean;
  hasWorkspaces: boolean;
  onUpdateAddressBarInfo: (...arguments_: any[]) => any;
  shouldPauseNotifications: boolean;
}
// @ts-expect-error ts-migrate(2456) FIXME: Type alias 'NavigationBarProps' circularly referen... Remove this comment to see the full error message
type NavigationBarProps = OwnNavigationBarProps & typeof NavigationBar.defaultProps;
// @ts-expect-error ts-migrate(7022) FIXME: 'NavigationBar' implicitly has type 'any' because ... Remove this comment to see the full error message
const NavigationBar = ({
  address,
  addressEdited,
  canGoBack,
  canGoForward,
  classes,
  hasTrafficLights,
  hasWorkspaces,
  onUpdateAddressBarInfo,
  shouldPauseNotifications,
}: NavigationBarProps) => {
  const [addressInputClicked, setAddressInputClicked] = useState(false);
  return (
    <div className={classNames(classes.root, hasTrafficLights && classes.rootWithTrafficLights)}>
      <div className={classes.left}>
        <IconButton
          aria-label="Go back"
          className={classes.iconButton}
          disabled={!hasWorkspaces || !canGoBack}
          onClick={async () => await window.service.window.goBack(window.meta.windowName)}>
          <ArrowBackIcon className={classes.icon} />
        </IconButton>
        <IconButton
          aria-label="Go forward"
          className={classes.iconButton}
          disabled={!hasWorkspaces || !canGoForward}
          onClick={async () => await window.service.window.goForward(window.meta.windowName)}>
          <ArrowForwardIcon className={classes.icon} />
        </IconButton>
        <IconButton
          aria-label="Reload"
          className={classes.iconButton}
          onClick={async () => await window.service.window.reload(window.meta.windowName)}
          disabled={!hasWorkspaces}>
          <RefreshIcon className={classes.icon} />
        </IconButton>
        <IconButton
          aria-label="Go home"
          className={classes.iconButton}
          onClick={async () => await window.service.window.goHome(window.meta.windowName)}
          disabled={!hasWorkspaces}>
          <HomeIcon className={classes.icon} />
        </IconButton>
      </div>
      <div className={classes.center}>
        <InputBase
          classes={{ root: classes.addressBarRoot, input: classes.addressBarInput }}
          placeholder="Search Google or type a URL"
          type="text"
          value={hasWorkspaces ? address : ''}
          disabled={!hasWorkspaces}
          endAdornment={
            addressEdited &&
            address &&
            hasWorkspaces && (
              <IconButton
                aria-label="Go"
                className={classes.goButton}
                onClick={async () => {
                  const processedUrl = processUrl(address);
                  onUpdateAddressBarInfo(processedUrl, false);
                  await window.service.workspaceView.loadURL(processedUrl);
                }}>
                <ArrowForwardIcon fontSize="small" />
              </IconButton>
            )
          }
          onChange={(e) => {
            onUpdateAddressBarInfo(e.target.value, true);
          }}
          onKeyDown={async (e) => {
            if (e.key === 'Enter') {
              (e.target as any).blur();
              const processedUrl = processUrl(address);
              onUpdateAddressBarInfo(processedUrl, false);
              await window.service.workspaceView.loadURL(processedUrl);
            }
          }}
          // https://stackoverflow.com/a/16659291
          onClick={(e) => {
            if (!addressInputClicked) {
              (e.target as any).select();
              setAddressInputClicked(true);
            }
          }}
          onBlur={() => {
            setAddressInputClicked(false);
          }}
        />
      </div>
      <div>
        <IconButton aria-label="Notifications" onClick={async () => await window.service.window.open(WindowNames.notifications)} className={classes.iconButton}>
          {shouldPauseNotifications ? <NotificationsPausedIcon className={classes.icon} /> : <NotificationsIcon className={classes.icon} />}
        </IconButton>
        <IconButton aria-label="Preferences" className={classes.iconButton} onClick={async () => await window.service.window.open(WindowNames.preferences)}>
          <SettingsIcon className={classes.icon} />
        </IconButton>
      </div>
    </div>
  );
};
NavigationBar.defaultProps = {
  address: '',
};
const mapStateToProps = (state: any) => ({
  address: state.general.address || '',
  addressEdited: Boolean(state.general.addressEdited),
  canGoBack: state.general.canGoBack,
  canGoForward: state.general.canGoForward,
  hasTrafficLights: window.remote.getPlatform() === 'darwin' && !state.preferences.titleBar && !state.preferences.sidebar,
  hasWorkspaces: Object.keys(state.workspaces).length > 0,
  shouldPauseNotifications: state.notifications.pauseNotificationsInfo !== null,
});
const actionCreators = {
  updateAddressBarInfo,
};
export default connectComponent(NavigationBar, mapStateToProps, actionCreators, styles);
