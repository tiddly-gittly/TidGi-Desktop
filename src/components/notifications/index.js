import React from 'react';
import PropTypes from 'prop-types';

import ListSubheader from '@material-ui/core/ListSubheader';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Divider from '@material-ui/core/Divider';
import MenuItem from '@material-ui/core/MenuItem';

import ChevronRightIcon from '@material-ui/icons/ChevronRight';

import { DateTimePicker } from 'material-ui-pickers';

import {
  format, isTomorrow, isToday,
  addMinutes, addHours, addDays, addWeeks,
} from 'date-fns';

import connectComponent from '../../helpers/connect-component';

import {
  requestSetPreference,
  requestShowPreferencesWindow,
  requestShowNotification,
} from '../../senders';

import StatedMenu from '../shared/stated-menu';

// https://www.sketchappsources.com/free-source/2501-iphone-app-background-sketch-freebie-resource.html
import nightBackgroundPng from '../../images/night-background.png';

const styles = (theme) => ({
  hidden: {
    display: 'none',
  },
  root: {
    padding: 0,
  },
  pausingHeader: {
    background: `url(${nightBackgroundPng})`,
    height: 210,
    backgroundSize: 400,
    alignItems: 'flex-end',
  },
  pausingHeaderText: {
    color: theme.palette.common.white,
  },
});

const formatDate = (d) => {
  if (isToday(d)) {
    return format(d, 'p');
  }
  if (isTomorrow(d)) {
    return `tomorrow at ${format(d, 'p')}`;
  }
  return format(d, 'PPPp');
};

const DialogPauseNotifications = (props) => {
  const {
    classes,
    pauseNotificationsInfo,
  } = props;

  const shouldPauseNotifications = pauseNotificationsInfo !== null;

  // https://material-ui-pickers-v2.dmtr-kovalenko.now.sh/guides/controlling-programmatically
  const pickerRef = React.useRef(null);

  const { remote } = window.require('electron');

  const quickShortcuts = [
    {
      name: '15 minutes',
      calcDate: () => addMinutes(new Date(), 15),
    },
    {
      name: '30 minutes',
      calcDate: () => addMinutes(new Date(), 30),
    },
    {
      name: '1 hour',
      calcDate: () => addHours(new Date(), 1),
    },
    {
      name: '2 hours',
      calcDate: () => addHours(new Date(), 2),
    },
    {
      name: '4 hours',
      calcDate: () => addHours(new Date(), 4),
    },
    {
      name: '8 hours',
      calcDate: () => addHours(new Date(), 8),
    },
    {
      name: '12 hours',
      calcDate: () => addHours(new Date(), 12),
    },
    {
      name: 'Unitl tommorow',
      calcDate: () => addDays(new Date(), 1),
    },
    {
      name: 'Until next week',
      calcDate: () => addWeeks(new Date(), 1),
    },
  ];

  const pauseNotif = (tilDate) => {
    requestSetPreference('pauseNotifications', `pause:${tilDate.toString()}`);
    requestShowNotification({
      title: 'Notifications paused',
      body: `Notifications paused until ${formatDate(tilDate)}.`,
    });
    remote.getCurrentWindow().close();
  };


  const renderList = () => {
    if (shouldPauseNotifications) {
      return (
        <List
          component="nav"
          className={classes.root}
        >
          <ListItem classes={{ root: classes.pausingHeader }}>
            <ListItemText
              primary={`Notifications paused until ${formatDate(new Date(pauseNotificationsInfo.tilDate))}.`}
              classes={{ primary: classes.pausingHeaderText }}
            />
          </ListItem>
          <ListItem button>
            <ListItemText
              primary="Resume notifications"
              onClick={() => {
                if (pauseNotificationsInfo.reason === 'scheduled') {
                  requestSetPreference('pauseNotifications', `resume:${pauseNotificationsInfo.tilDate}`);
                } else if (pauseNotificationsInfo.schedule
                  && new Date() < new Date(pauseNotificationsInfo.schedule.to)) {
                  requestSetPreference('pauseNotifications', `resume:${pauseNotificationsInfo.schedule.to}`);
                } else {
                  requestSetPreference('pauseNotifications', null);
                }
                requestShowNotification({
                  title: 'Notifications resumed',
                  body: 'Notifications are now resumed.',
                });
                remote.getCurrentWindow().close();
              }}
            />
          </ListItem>
          {pauseNotificationsInfo.reason !== 'scheduled' && (
            <>
              <Divider />
              <StatedMenu
                id="adjustTime"
                buttonElement={(
                  <ListItem button>
                    <ListItemText primary="Adjust time" />
                    <ChevronRightIcon color="action" />
                  </ListItem>
                )}
              >
                {quickShortcuts.map((shortcut) => (
                  <MenuItem
                    key={shortcut.name}
                    onClick={() => pauseNotif(shortcut.calcDate())}
                  >
                    {shortcut.name}
                  </MenuItem>
                ))}
                <MenuItem
                  onClick={(e) => {
                    if (pickerRef.current) {
                      pickerRef.current.open(e);
                    }
                  }}
                >
                  Custom...
                </MenuItem>
              </StatedMenu>
            </>
          )}
          <Divider />
          <ListItem button>
            <ListItemText
              primary={pauseNotificationsInfo.reason === 'scheduled' ? 'Adjust schedule...' : 'Pause notifications by schedule...'}
              onClick={() => {
                requestShowPreferencesWindow();
                remote.getCurrentWindow().close();
              }}
            />
          </ListItem>
        </List>
      );
    }

    return (
      <List
        component="nav"
        subheader={<ListSubheader component="div">Pause notifications</ListSubheader>}
        className={classes.root}
      >
        {quickShortcuts.map((shortcut) => (
          <ListItem
            button
            key={shortcut.name}
            onClick={() => pauseNotif(shortcut.calcDate())}
          >
            <ListItemText primary={shortcut.name} />
          </ListItem>
        ))}
        <ListItem
          button
          onClick={(e) => {
            if (pickerRef.current) {
              pickerRef.current.open(e);
            }
          }}
        >
          <ListItemText primary="Custom..." />
        </ListItem>
        <Divider />
        <ListItem button>
          <ListItemText
            primary="Pause notifications by schedule..."
            onClick={() => {
              requestShowPreferencesWindow();
              remote.getCurrentWindow().close();
            }}
          />
        </ListItem>
      </List>
    );
  };

  return (
    <>
      {renderList()}
      <DateTimePicker
        value={new Date()}
        onChange={pauseNotif}
        label="Custom"
        ref={pickerRef}
        className={classes.hidden}
        disablePast
        showTodayButton
      />
    </>
  );
};

DialogPauseNotifications.defaultProps = {
  pauseNotificationsInfo: null,
};

DialogPauseNotifications.propTypes = {
  classes: PropTypes.object.isRequired,
  pauseNotificationsInfo: PropTypes.object,
};

const mapStateToProps = (state) => ({
  pauseNotificationsInfo: state.notifications.pauseNotificationsInfo,
});

const actionCreators = {};

export default connectComponent(
  DialogPauseNotifications,
  mapStateToProps,
  actionCreators,
  styles,
);
