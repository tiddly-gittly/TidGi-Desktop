import React from 'react';
import PropTypes from 'prop-types';

import IconButton from '@material-ui/core/IconButton';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import ArrowForwardIcon from '@material-ui/icons/ArrowForward';
import HomeIcon from '@material-ui/icons/Home';
import RefreshIcon from '@material-ui/icons/Refresh';
import SettingsIcon from '@material-ui/icons/SettingsSharp';
import NotificationsIcon from '@material-ui/icons/Notifications';
import NotificationsPausedIcon from '@material-ui/icons/NotificationsPaused';

import connectComponent from '../../helpers/connect-component';

import {
  requestGoBack,
  requestGoForward,
  requestGoHome,
  requestReload,
  requestShowPreferencesWindow,
  requestShowNotificationsWindow,
} from '../../senders';

const styles = (theme) => ({
  root: {
    width: '100%',
    height: 36,
    backgroundColor: theme.palette.background.paper,
    borderBottom: '1px solid rgba(0, 0, 0, 0.2)',
    display: 'flex',
    alignItems: 'center',
    paddingLeft: theme.spacing.unit,
    paddingRight: theme.spacing.unit,
    WebkitAppRegion: 'drag',
    WebkitUserSelect: 'none',
  },
  left: {
    flex: 1,
  },
  iconButton: {
    padding: 6,
  },
  icon: {
    fontSize: '18px',
  },
});

const NavigationBar = ({
  canGoBack,
  canGoForward,
  classes,
  shouldPauseNotifications,
}) => (
  <div className={classes.root}>
    <div className={classes.left}>
      <IconButton aria-label="Go back" className={classes.iconButton} disabled={!canGoBack} onClick={requestGoBack}>
        <ArrowBackIcon className={classes.icon} />
      </IconButton>
      <IconButton aria-label="Go forward" className={classes.iconButton} disabled={!canGoForward} onClick={requestGoForward}>
        <ArrowForwardIcon className={classes.icon} />
      </IconButton>
      <IconButton aria-label="Reload" className={classes.iconButton} onClick={requestReload}>
        <RefreshIcon className={classes.icon} />
      </IconButton>
      <IconButton aria-label="Go home" className={classes.iconButton} onClick={requestGoHome}>
        <HomeIcon className={classes.icon} />
      </IconButton>
    </div>
    <div>
      <IconButton aria-label="Notifications" onClick={requestShowNotificationsWindow} className={classes.iconButton}>
        {shouldPauseNotifications
          ? <NotificationsPausedIcon className={classes.icon} />
          : <NotificationsIcon className={classes.icon} />}
      </IconButton>
      <IconButton aria-label="Preferences" className={classes.iconButton} onClick={requestShowPreferencesWindow}>
        <SettingsIcon className={classes.icon} />
      </IconButton>
    </div>
  </div>
);

NavigationBar.propTypes = {
  canGoBack: PropTypes.bool.isRequired,
  canGoForward: PropTypes.bool.isRequired,
  classes: PropTypes.object.isRequired,
  shouldPauseNotifications: PropTypes.bool.isRequired,
};

const mapStateToProps = (state) => ({
  canGoBack: state.general.canGoBack,
  canGoForward: state.general.canGoForward,
  shouldPauseNotifications: state.notifications.pauseNotificationsInfo !== null,
});

export default connectComponent(
  NavigationBar,
  mapStateToProps,
  null,
  styles,
);
