/* eslint-disable @typescript-eslint/prefer-ts-expect-error */
/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable unicorn/no-useless-undefined */
import React, { useState } from 'react';
import styled from 'styled-components';

import ListSubheader from '@material-ui/core/ListSubheader';
import ListRaw from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Divider from '@material-ui/core/Divider';
import TextField from '@material-ui/core/TextField';
import MenuItem from '@material-ui/core/MenuItem';
import Container from '@material-ui/core/Container';

import ChevronRightIcon from '@material-ui/icons/ChevronRight';

import DateTimePicker from '@material-ui/lab/DateTimePicker';
import { WindowNames } from '@services/windows/WindowProperties';

import StatedMenu from '../../components/github/stated-menu';

// https://www.sketchappsources.com/free-source/2501-iphone-app-background-sketch-freebie-resource.html
import nightBackgroundPng from '../../images/night-background.png';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { useNotificationInfoObservable } from '@services/notifications/hooks';
import { quickShortcuts } from './quickShortcuts';
import { PreferenceSections } from '@services/preferences/interface';
import { formatDate } from '@services/libs/formatDate';

const Root = styled(Container)`
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0;
`;

const List = styled(ListRaw)`
  width: 100%;
`;
List.defaultProps = {
  dense: true,
  disablePadding: true,
};

const HiddenTextField = styled(TextField)`
  display: none;
`;

// TODO: handle classes={{ root: classes.pausingHeader }}
const PausingHeader = styled(ListItem)`
  background: url(${nightBackgroundPng});
  height: 210;
  background-size: 400;
  align-items: flex-end;
`;

// TODO: handle classes={{ primary: classes.pausingHeaderText }}
const PausingHeaderText = styled(ListItemText)`
  color: white;
`;

const pauseNotification = (tilDate: Date): void => {
  void window.service.preference.set('pauseNotifications', `pause:${tilDate.toString()}`);
  void window.service.notification.show({
    title: 'Notifications paused',
    body: `Notifications paused until ${formatDate(tilDate)}.`,
  });
  window.remote.closeCurrentWindow();
};

export default function PauseNotifications(): JSX.Element {
  const preference = usePreferenceObservable();
  const pauseNotificationsInfo = useNotificationInfoObservable();
  const [showDateTimePicker, showDateTimePickerSetter] = useState(false);
  if (preference === undefined) {
    return <Root>Loading...</Root>;
  }

  const renderList = (): JSX.Element => {
    if (pauseNotificationsInfo !== undefined) {
      return (
        <List>
          <PausingHeader>
            <PausingHeaderText primary={`Notifications paused until ${formatDate(new Date(pauseNotificationsInfo.tilDate))}.`} />
          </PausingHeader>
          <ListItem button>
            <ListItemText
              primary="Resume notifications"
              onClick={() => {
                if (pauseNotificationsInfo === undefined) {
                  return;
                }
                if (pauseNotificationsInfo.reason === 'scheduled') {
                  void window.service.preference.set('pauseNotifications', `resume:${pauseNotificationsInfo.tilDate.toISOString()}`);
                } else if (pauseNotificationsInfo.schedule !== undefined && new Date() < new Date(pauseNotificationsInfo.schedule.to.toISOString())) {
                  void window.service.preference.set('pauseNotifications', `resume:${pauseNotificationsInfo.schedule.to.toISOString()}`);
                } else {
                  void window.service.preference.set('pauseNotifications', undefined);
                }
                void window.service.notification.show({
                  title: 'Notifications resumed',
                  body: 'Notifications are now resumed.',
                });
                window.remote.closeCurrentWindow();
              }}
            />
          </ListItem>
          {pauseNotificationsInfo.reason !== 'scheduled' && (
            <>
              <Divider />
              <StatedMenu
                id="adjustTime"
                buttonElement={
                  <ListItem button>
                    <ListItemText primary="Adjust time" />
                    <ChevronRightIcon color="action" />
                  </ListItem>
                }>
                {quickShortcuts.map((shortcut) => (
                  <MenuItem dense key={shortcut.name} onClick={() => pauseNotification(shortcut.calcDate())}>
                    {shortcut.name}
                  </MenuItem>
                ))}
                <MenuItem dense onClick={() => showDateTimePickerSetter(true)}>
                  Custom...
                </MenuItem>
              </StatedMenu>
            </>
          )}
          <Divider />
          <ListItem button>
            <ListItemText
              primary={pauseNotificationsInfo.reason === 'scheduled' ? 'Adjust schedule...' : 'Pause notifications by schedule...'}
              onClick={async () => {
                await window.service.window.open(WindowNames.preferences, { gotoTab: PreferenceSections.notifications });
                window.remote.closeCurrentWindow();
              }}
            />
          </ListItem>
        </List>
      );
    }

    return (
      <List subheader={<ListSubheader component="div">Pause notifications</ListSubheader>}>
        {quickShortcuts.map((shortcut) => (
          <ListItem button key={shortcut.name} onClick={() => pauseNotification(shortcut.calcDate())}>
            <ListItemText primary={shortcut.name} />
          </ListItem>
        ))}
        <ListItem button onClick={() => showDateTimePickerSetter(true)}>
          <ListItemText primary="Custom..." />
        </ListItem>
        <Divider />
        <ListItem button>
          <ListItemText
            primary="Pause notifications by schedule..."
            onClick={async () => {
              await window.service.window.open(WindowNames.preferences, { gotoTab: PreferenceSections.notifications });
              window.remote.closeCurrentWindow();
            }}
          />
        </ListItem>
      </List>
    );
  };

  return (
    <Root>
      {renderList()}
      <DateTimePicker
        value={new Date()}
        renderInput={(dateTimeProps) => <HiddenTextField {...dateTimeProps} />}
        onChange={(tilDate) => {
          if (tilDate === null) return;
          pauseNotification(tilDate);
        }}
        label="Custom"
        open={showDateTimePicker}
        onOpen={() => showDateTimePickerSetter(true)}
        onClose={() => showDateTimePickerSetter(false)}
        disablePast
        showTodayButton
      />
    </Root>
  );
}
