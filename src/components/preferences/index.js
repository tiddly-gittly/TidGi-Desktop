import React from 'react';
import PropTypes from 'prop-types';

import Button from '@material-ui/core/Button';
import Divider from '@material-ui/core/Divider';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import MenuItem from '@material-ui/core/MenuItem';
import Paper from '@material-ui/core/Paper';
import Switch from '@material-ui/core/Switch';
import Typography from '@material-ui/core/Typography';

import ChevronRightIcon from '@material-ui/icons/ChevronRight';

import { TimePicker } from 'material-ui-pickers';

import connectComponent from '../../helpers/connect-component';

import StatedMenu from '../shared/stated-menu';

import { updateIsDefaultMailClient, updateIsDefaultWebBrowser } from '../../state/general/actions';

import {
  requestOpenInBrowser,
  requestSetPreference,
  requestSetSystemPreference,
  requestResetPreferences,
  requestClearBrowsingData,
  requestShowRequireRestartDialog,
  requestShowCodeInjectionWindow,
} from '../../senders';

const { remote } = window.require('electron');

const styles = (theme) => ({
  root: {
    padding: theme.spacing.unit * 2,
    background: theme.palette.background.default,
  },
  sectionTitle: {
    paddingLeft: theme.spacing.unit * 2,
  },
  paper: {
    marginTop: theme.spacing.unit * 0.5,
    marginBottom: theme.spacing.unit * 3,
  },
  switchBase: {
    height: 'auto',
  },
  timePickerContainer: {
    marginTop: theme.spacing.unit,
    marginBottom: theme.spacing.unit,
    display: 'flex',
    justifyContent: 'space-between',
  },
});

const getThemeString = (theme) => {
  if (theme === 'light') return 'Light';
  if (theme === 'dark') return 'Dark';
  return 'System default';
};

const getOpenAtLoginString = (openAtLogin) => {
  if (openAtLogin === 'yes-hidden') return 'Yes, but minimized';
  if (openAtLogin === 'yes') return 'Yes';
  return 'No';
};

const Preferences = ({
  askForDownloadPath,
  attachToMenubar,
  classes,
  cssCodeInjection,
  downloadPath,
  isDefaultMailClient,
  isDefaultWebBrowser,
  jsCodeInjection,
  navigationBar,
  onUpdateIsDefaultMailClient,
  onUpdateIsDefaultWebBrowser,
  openAtLogin,
  pauseNotificationsBySchedule,
  pauseNotificationsByScheduleFrom,
  pauseNotificationsByScheduleTo,
  rememberLastPageVisited,
  shareWorkspaceBrowsingData,
  spellChecker,
  swipeToNavigate,
  theme,
  unreadCountBadge,
}) => (
  <div className={classes.root}>
    <Typography variant="subtitle2" className={classes.sectionTitle}>
      Appearance
    </Typography>
    <Paper className={classes.paper}>
      <List dense>
        <StatedMenu
          id="theme"
          buttonElement={(
            <ListItem button>
              <ListItemText primary="Theme" secondary={getThemeString(theme)} />
              <ChevronRightIcon color="action" />
            </ListItem>
          )}
        >
          <MenuItem onClick={() => requestSetPreference('theme', 'automatic')}>System default</MenuItem>
          <MenuItem onClick={() => requestSetPreference('theme', 'light')}>Light</MenuItem>
          <MenuItem onClick={() => requestSetPreference('theme', 'dark')}>Dark</MenuItem>
        </StatedMenu>
        <Divider />
        <ListItem>
          <ListItemText
            primary="Show navigation bar"
            secondary="Navigation bar lets you go back, forward, home and reload."
          />
          <Switch
            checked={navigationBar}
            onChange={(e) => {
              requestSetPreference('navigationBar', e.target.checked);
              requestShowRequireRestartDialog();
            }}
            classes={{
              switchBase: classes.switchBase,
            }}
          />
        </ListItem>
      </List>
    </Paper>

    <Typography variant="subtitle2" className={classes.sectionTitle}>
      Notifications
    </Typography>
    <Paper className={classes.paper}>
      <List dense>
        <ListItem>
          <ListItemText>
            Automatically disable notifications by schedule:
            <div className={classes.timePickerContainer}>
              <TimePicker
                autoOk={false}
                label="from"
                value={new Date(pauseNotificationsByScheduleFrom)}
                onChange={(d) => requestSetPreference('pauseNotificationsByScheduleFrom', d.toString())}
                disabled={!pauseNotificationsBySchedule}
              />
              <TimePicker
                autoOk={false}
                label="to"
                value={new Date(pauseNotificationsByScheduleTo)}
                onChange={(d) => requestSetPreference('pauseNotificationsByScheduleTo', d.toString())}
                disabled={!pauseNotificationsBySchedule}
              />
            </div>
            (
            {window.Intl.DateTimeFormat().resolvedOptions().timeZone}
            )
          </ListItemText>
          <Switch
            checked={pauseNotificationsBySchedule}
            onChange={(e) => {
              requestSetPreference('pauseNotificationsBySchedule', e.target.checked);
            }}
            classes={{
              switchBase: classes.switchBase,
            }}
          />
        </ListItem>
        {window.process.platform === 'darwin' && (
          <>
            <Divider />
            <ListItem>
              <ListItemText primary="Show unread count badge" />
              <Switch
                checked={unreadCountBadge}
                onChange={(e) => {
                  requestSetPreference('unreadCountBadge', e.target.checked);
                  requestShowRequireRestartDialog();
                }}
                classes={{
                  switchBase: classes.switchBase,
                }}
              />
            </ListItem>
          </>
        )}
      </List>
    </Paper>

    <Typography variant="subtitle2" className={classes.sectionTitle}>
      Experience
    </Typography>
    <Paper className={classes.paper}>
      <List dense>
        <ListItem>
          <ListItemText
            primary="Attach to menubar"
          />
          <Switch
            checked={attachToMenubar}
            onChange={(e) => {
              requestSetPreference('attachToMenubar', e.target.checked);
              requestShowRequireRestartDialog();
            }}
            classes={{
              switchBase: classes.switchBase,
            }}
          />
        </ListItem>
        <Divider />
        {window.process.platform === 'darwin' && (
          <>
            <ListItem>
              <ListItemText
                primary="Swipe to navigate"
                secondary={(
                  <>
                    <span>Navigate between pages with 3-finger gestures.</span>
                    <br />
                    <span>To enable it, you also need to change </span>
                    <b>
                      macOS Preferences &gt; Trackpad &gt; More Gestures &gt; Swipe between page
                    </b>
                    <span> to </span>
                    <b>Swipe with three fingers</b>
                    <span> or </span>
                    <b>Swipe with two or three fingers.</b>
                  </>
                )}
              />
              <Switch
                checked={swipeToNavigate}
                onChange={(e) => {
                  requestSetPreference('swipeToNavigate', e.target.checked);
                  requestShowRequireRestartDialog();
                }}
                classes={{
                  switchBase: classes.switchBase,
                }}
              />
            </ListItem>
            <Divider />
          </>
        )}
        <ListItem>
          <ListItemText primary="Use spell checker" />
          <Switch
            checked={spellChecker}
            onChange={(e) => {
              requestSetPreference('spellChecker', e.target.checked);
              requestShowRequireRestartDialog();
            }}
            classes={{
              switchBase: classes.switchBase,
            }}
          />
        </ListItem>
      </List>
    </Paper>

    <Typography variant="subtitle2" className={classes.sectionTitle}>
      Downloads
    </Typography>
    <Paper className={classes.paper}>
      <List dense>
        <ListItem
          button
          onClick={() => {
            remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
              properties: ['openDirectory'],
            }).then((result) => {
              if (!result.canceled && result.filePaths) {
                requestSetPreference('downloadPath', result.filePaths[0]);
              }
            }).catch((err) => {
              console.log(err); // eslint-disable-line no-console
            });
          }}
        >
          <ListItemText
            primary="Download Location"
            secondary={downloadPath}
          />
          <ChevronRightIcon color="action" />
        </ListItem>
        <Divider />
        <ListItem>
          <ListItemText primary="Ask where to save each file before downloading" />
          <Switch
            checked={askForDownloadPath}
            onChange={(e) => {
              requestSetPreference('askForDownloadPath', e.target.checked);
            }}
            classes={{
              switchBase: classes.switchBase,
            }}
          />
        </ListItem>
      </List>
    </Paper>

    <Typography variant="subtitle2" className={classes.sectionTitle}>
      Privacy &amp; Security
    </Typography>
    <Paper className={classes.paper}>
      <List dense>
        <ListItem>
          <ListItemText primary="Remember last page visited" />
          <Switch
            checked={rememberLastPageVisited}
            onChange={(e) => {
              requestSetPreference('rememberLastPageVisited', e.target.checked);
              requestShowRequireRestartDialog();
            }}
            classes={{
              switchBase: classes.switchBase,
            }}
          />
        </ListItem>
        <Divider />
        <ListItem>
          <ListItemText primary="Share browsing data between workspaces" />
          <Switch
            checked={shareWorkspaceBrowsingData}
            onChange={(e) => {
              requestSetPreference('shareWorkspaceBrowsingData', e.target.checked);
              requestShowRequireRestartDialog();
            }}
            classes={{
              switchBase: classes.switchBase,
            }}
          />
        </ListItem>
        <Divider />
        <ListItem button onClick={requestClearBrowsingData}>
          <ListItemText primary="Clear browsing data" secondary="Clear cookies, cache, and more" />
          <ChevronRightIcon color="action" />
        </ListItem>
        <Divider />
        <ListItem button onClick={() => requestOpenInBrowser('https://singleboxapp.com/privacy')}>
          <ListItemText primary="Privacy Policy" />
        </ListItem>
      </List>
    </Paper>

    <Typography variant="subtitle2" className={classes.sectionTitle}>
      Default App
    </Typography>
    <Paper className={classes.paper}>
      <List dense>
        {isDefaultMailClient ? (
          <ListItem>
            <ListItemText secondary="Singlebox is your default email client." />
          </ListItem>
        ) : (
          <ListItem>
            <ListItemText primary="Default email client" secondary="Make Singlebox the default email client." />
            <Button
              variant="outlined"
              size="small"
              color="default"
              className={classes.button}
              onClick={() => {
                remote.app.setAsDefaultProtocolClient('mailto');
                onUpdateIsDefaultMailClient(remote.app.isDefaultProtocolClient('mailto'));
              }}
            >
              Make default
            </Button>
          </ListItem>
        )}
        <Divider />
        {isDefaultWebBrowser ? (
          <ListItem>
            <ListItemText secondary="Singlebox is your default web browser." />
          </ListItem>
        ) : (
          <ListItem>
            <ListItemText primary="Default web browser" secondary="Make Singlebox the default web browser." />
            <Button
              variant="outlined"
              size="small"
              color="default"
              className={classes.button}
              onClick={() => {
                remote.app.setAsDefaultProtocolClient('http');
                remote.app.setAsDefaultProtocolClient('https');
                onUpdateIsDefaultWebBrowser(remote.app.isDefaultProtocolClient('http'));
              }}
            >
              Make default
            </Button>
          </ListItem>
        )}
      </List>
    </Paper>

    <Typography variant="subtitle2" className={classes.sectionTitle}>
      System
    </Typography>
    <Paper className={classes.paper}>
      <List dense>
        <StatedMenu
          id="openAtLogin"
          buttonElement={(
            <ListItem button>
              <ListItemText primary="Open at login" secondary={getOpenAtLoginString(openAtLogin)} />
              <ChevronRightIcon color="action" />
            </ListItem>
          )}
        >
          <MenuItem onClick={() => requestSetSystemPreference('openAtLogin', 'yes')}>Yes</MenuItem>
          <MenuItem onClick={() => requestSetSystemPreference('openAtLogin', 'yes-hidden')}>Yes, but minimized</MenuItem>
          <MenuItem onClick={() => requestSetSystemPreference('openAtLogin', 'no')}>No</MenuItem>
        </StatedMenu>
      </List>
    </Paper>

    <Typography variant="subtitle2" className={classes.sectionTitle}>
      Developers
    </Typography>
    <Paper className={classes.paper}>
      <List dense>
        <ListItem button onClick={() => requestShowCodeInjectionWindow('js')}>
          <ListItemText primary="JS Code Injection" secondary={jsCodeInjection ? 'Set' : 'Not set'} />
          <ChevronRightIcon color="action" />
        </ListItem>
        <ListItem button onClick={() => requestShowCodeInjectionWindow('css')}>
          <ListItemText primary="CSS Code Injection" secondary={cssCodeInjection ? 'Set' : 'Not set'} />
          <ChevronRightIcon color="action" />
        </ListItem>
      </List>
    </Paper>

    <Typography variant="subtitle2" className={classes.sectionTitle}>
      Reset
    </Typography>
    <Paper className={classes.paper}>
      <List dense>
        <ListItem button onClick={requestResetPreferences}>
          <ListItemText primary="Restore preferences to their original defaults" />
          <ChevronRightIcon color="action" />
        </ListItem>
      </List>
    </Paper>
  </div>
);

Preferences.defaultProps = {
  cssCodeInjection: null,
  jsCodeInjection: null,
};

Preferences.propTypes = {
  askForDownloadPath: PropTypes.bool.isRequired,
  attachToMenubar: PropTypes.bool.isRequired,
  classes: PropTypes.object.isRequired,
  cssCodeInjection: PropTypes.string,
  downloadPath: PropTypes.string.isRequired,
  isDefaultMailClient: PropTypes.bool.isRequired,
  isDefaultWebBrowser: PropTypes.bool.isRequired,
  jsCodeInjection: PropTypes.string,
  navigationBar: PropTypes.bool.isRequired,
  onUpdateIsDefaultMailClient: PropTypes.func.isRequired,
  onUpdateIsDefaultWebBrowser: PropTypes.func.isRequired,
  openAtLogin: PropTypes.oneOf(['yes', 'yes-hidden', 'no']).isRequired,
  pauseNotificationsBySchedule: PropTypes.bool.isRequired,
  pauseNotificationsByScheduleFrom: PropTypes.string.isRequired,
  pauseNotificationsByScheduleTo: PropTypes.string.isRequired,
  rememberLastPageVisited: PropTypes.bool.isRequired,
  shareWorkspaceBrowsingData: PropTypes.bool.isRequired,
  spellChecker: PropTypes.bool.isRequired,
  swipeToNavigate: PropTypes.bool.isRequired,
  theme: PropTypes.string.isRequired,
  unreadCountBadge: PropTypes.bool.isRequired,
};

const mapStateToProps = (state) => ({
  askForDownloadPath: state.preferences.askForDownloadPath,
  attachToMenubar: state.preferences.attachToMenubar,
  cssCodeInjection: state.preferences.cssCodeInjection,
  downloadPath: state.preferences.downloadPath,
  isDefaultMailClient: state.general.isDefaultMailClient,
  isDefaultWebBrowser: state.general.isDefaultWebBrowser,
  jsCodeInjection: state.preferences.jsCodeInjection,
  navigationBar: state.preferences.navigationBar,
  openAtLogin: state.systemPreferences.openAtLogin,
  pauseNotificationsBySchedule: state.preferences.pauseNotificationsBySchedule,
  pauseNotificationsByScheduleFrom: state.preferences.pauseNotificationsByScheduleFrom,
  pauseNotificationsByScheduleTo: state.preferences.pauseNotificationsByScheduleTo,
  rememberLastPageVisited: state.preferences.rememberLastPageVisited,
  shareWorkspaceBrowsingData: state.preferences.shareWorkspaceBrowsingData,
  spellChecker: state.preferences.spellChecker,
  swipeToNavigate: state.preferences.swipeToNavigate,
  theme: state.preferences.theme,
  unreadCountBadge: state.preferences.unreadCountBadge,
});

const actionCreators = {
  updateIsDefaultMailClient,
  updateIsDefaultWebBrowser,
};

export default connectComponent(
  Preferences,
  mapStateToProps,
  actionCreators,
  styles,
);
