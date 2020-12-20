import React from 'react';

import ListSubheader from '@material-ui/core/ListSubheader';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Divider from '@material-ui/core/Divider';
import TextField from '@material-ui/core/TextField';
import MenuItem from '@material-ui/core/MenuItem';
import Container from '@material-ui/core/Container';

import ChevronRightIcon from '@material-ui/icons/ChevronRight';

import { DateTimePicker } from '@material-ui/pickers';

import { format, isTomorrow, isToday, addMinutes, addHours, addDays, addWeeks } from 'date-fns';

import connectComponent from '../../helpers/connect-component';

import { requestSetPreference, requestShowPreferencesWindow, requestShowNotification } from '../../senders';

// @ts-expect-error ts-migrate(6142) FIXME: Module '../shared/stated-menu' was resolved to '/U... Remove this comment to see the full error message
import StatedMenu from '../shared/stated-menu';

import { updateShowDateTimePicker } from '../../state/notifications/actions';

// https://www.sketchappsources.com/free-source/2501-iphone-app-background-sketch-freebie-resource.html
// @ts-expect-error ts-migrate(2307) FIXME: Cannot find module '../../images/night-background.... Remove this comment to see the full error message
import nightBackgroundPng from '../../images/night-background.png';

const styles = (theme: any) => ({
  root: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 0,
  },

  list: {
    width: '100%',
  },

  hidden: {
    display: 'none',
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

const formatDate = (d: any) => {
  if (isToday(d)) {
    return format(d, 'p');
  }
  if (isTomorrow(d)) {
    return `tomorrow at ${format(d, 'p')}`;
  }
  return format(d, 'PPPp');
};

interface OwnDialogPauseNotificationsProps {
  classes: any;
  onUpdateShowDateTimePicker: (...arguments_: any[]) => any;
  pauseNotificationsInfo?: any;
  showDateTimePicker: boolean;
}

// @ts-expect-error ts-migrate(2456) FIXME: Type alias 'DialogPauseNotificationsProps' circula... Remove this comment to see the full error message
type DialogPauseNotificationsProps = OwnDialogPauseNotificationsProps & typeof DialogPauseNotifications.defaultProps;

// @ts-expect-error ts-migrate(7022) FIXME: 'DialogPauseNotifications' implicitly has type 'an... Remove this comment to see the full error message
const DialogPauseNotifications = (props: DialogPauseNotificationsProps) => {
  const { classes, onUpdateShowDateTimePicker, pauseNotificationsInfo, showDateTimePicker } = props;

  const shouldPauseNotifications = pauseNotificationsInfo !== null;

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
      name: '45 minutes',
      calcDate: () => addMinutes(new Date(), 45),
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
      name: '6 hours',
      calcDate: () => addHours(new Date(), 6),
    },
    {
      name: '8 hours',
      calcDate: () => addHours(new Date(), 8),
    },
    {
      name: '10 hours',
      calcDate: () => addHours(new Date(), 8),
    },
    {
      name: '12 hours',
      calcDate: () => addHours(new Date(), 12),
    },
    {
      name: 'Until tomorrow',
      calcDate: () => addDays(new Date(), 1),
    },
    {
      name: 'Until next week',
      calcDate: () => addWeeks(new Date(), 1),
    },
  ];

  const pauseNotif = (tilDate: any) => {
    requestSetPreference('pauseNotifications', `pause:${tilDate.toString()}`);
    requestShowNotification({
      title: 'Notifications paused',
      body: `Notifications paused until ${formatDate(tilDate)}.`,
    });
    window.remote.closeCurrentWindow();
  };

  const renderList = () => {
    if (shouldPauseNotifications) {
      return (
        // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <List dense disablePadding className={classes.list}>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <ListItem classes={{ root: classes.pausingHeader }}>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItemText
              primary={`Notifications paused until ${formatDate(new Date(pauseNotificationsInfo.tilDate))}.`}
              classes={{ primary: classes.pausingHeaderText }}
            />
          </ListItem>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <ListItem button>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItemText
              primary="Resume notifications"
              onClick={() => {
                if (pauseNotificationsInfo.reason === 'scheduled') {
                  requestSetPreference('pauseNotifications', `resume:${pauseNotificationsInfo.tilDate}`);
                } else if (pauseNotificationsInfo.schedule && new Date() < new Date(pauseNotificationsInfo.schedule.to)) {
                  requestSetPreference('pauseNotifications', `resume:${pauseNotificationsInfo.schedule.to}`);
                } else {
                  requestSetPreference('pauseNotifications', null);
                }
                requestShowNotification({
                  title: 'Notifications resumed',
                  body: 'Notifications are now resumed.',
                });
                window.remote.closeCurrentWindow();
              }}
            />
          </ListItem>
          {pauseNotificationsInfo.reason !== 'scheduled' && (
            // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Divider />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <StatedMenu
                id="adjustTime"
                buttonElement={
                  // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  <ListItem button>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <ListItemText primary="Adjust time" />
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <ChevronRightIcon color="action" />
                  </ListItem>
                }>
                {quickShortcuts.map((shortcut) => (
                  // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  <MenuItem dense key={shortcut.name} onClick={() => pauseNotif(shortcut.calcDate())}>
                    {shortcut.name}
                  </MenuItem>
                ))}
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <MenuItem dense onClick={() => onUpdateShowDateTimePicker(true)}>
                  Custom...
                </MenuItem>
              </StatedMenu>
            </>
          )}
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Divider />
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <ListItem button>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItemText
              primary={pauseNotificationsInfo.reason === 'scheduled' ? 'Adjust schedule...' : 'Pause notifications by schedule...'}
              onClick={() => {
                requestShowPreferencesWindow('notifications');
                window.remote.closeCurrentWindow();
              }}
            />
          </ListItem>
        </List>
      );
    }

    return (
      // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <List dense className={classes.list} disablePadding subheader={<ListSubheader component="div">Pause notifications</ListSubheader>}>
        {quickShortcuts.map((shortcut) => (
          // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <ListItem button key={shortcut.name} onClick={() => pauseNotif(shortcut.calcDate())}>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItemText primary={shortcut.name} />
          </ListItem>
        ))}
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <ListItem button onClick={() => onUpdateShowDateTimePicker(true)}>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <ListItemText primary="Custom..." />
        </ListItem>
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Divider />
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <ListItem button>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <ListItemText
            primary="Pause notifications by schedule..."
            onClick={() => {
              requestShowPreferencesWindow('notifications');
              window.remote.closeCurrentWindow();
            }}
          />
        </ListItem>
      </List>
    );
  };

  return (
    // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Container className={classes.root}>
      {renderList()}
      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <DateTimePicker
        value={new Date()}
        // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        renderInput={(dateTimeProps) => <TextField className={classes.hidden} {...dateTimeProps} />}
        onChange={pauseNotif}
        label="Custom"
        open={showDateTimePicker}
        onOpen={() => onUpdateShowDateTimePicker(true)}
        onClose={() => onUpdateShowDateTimePicker(false)}
        disablePast
        showTodayButton
      />
    </Container>
  );
};

DialogPauseNotifications.defaultProps = {
  pauseNotificationsInfo: null,
};

const mapStateToProps = (state: any) => ({
  pauseNotificationsInfo: state.notifications.pauseNotificationsInfo,
  showDateTimePicker: state.notifications.showDateTimePicker,
});

const actionCreators = {
  updateShowDateTimePicker,
};

export default connectComponent(DialogPauseNotifications, mapStateToProps, actionCreators, styles);
