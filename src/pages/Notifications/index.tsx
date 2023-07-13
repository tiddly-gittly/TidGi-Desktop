/* eslint-disable @typescript-eslint/prefer-ts-expect-error */
/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable unicorn/no-useless-undefined */
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import ListRaw from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import MenuItem from '@mui/material/MenuItem';

import ChevronRightIcon from '@mui/icons-material/ChevronRight';

import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { WindowNames } from '@services/windows/WindowProperties';

import PopUpMenuItem from '@/components/PopUpMenuItem';

// https://www.sketchappsources.com/free-source/2501-iphone-app-background-sketch-freebie-resource.html
import { ListItemButton } from '@mui/material';
import { formatDate } from '@services/libs/formatDate';
import { useNotificationInfoObservable } from '@services/notifications/hooks';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { PreferenceSections } from '@services/preferences/interface';
import nightBackgroundPng from '../../images/night-background.png';
import { quickShortcuts } from './quickShortcuts';

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

// TODO: handle classes={{ root: classes.pausingHeader }}
const PausingHeader = styled(ListItem)`
  background: url(${nightBackgroundPng});
  height: 210px;
  background-size: 400px;
  align-items: flex-end;
` as typeof ListItem;

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
  void window.remote.closeCurrentWindow();
};

export default function Notifications(): JSX.Element {
  const { t } = useTranslation();
  const preference = usePreferenceObservable();
  const pauseNotificationsInfo = useNotificationInfoObservable();
  const [showDateTimePicker, showDateTimePickerSetter] = useState(false);
  if (preference === undefined) {
    return <Root>{t('Loading')}</Root>;
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
              primary='Resume notifications'
              onClick={async () => {
                if (pauseNotificationsInfo === undefined) {
                  return;
                }
                if (pauseNotificationsInfo.reason === 'scheduled') {
                  await window.service.preference.set('pauseNotifications', `resume:${pauseNotificationsInfo.tilDate.toISOString()}`);
                } else if (pauseNotificationsInfo.schedule !== undefined && new Date() < new Date(pauseNotificationsInfo.schedule.to.toISOString())) {
                  await window.service.preference.set('pauseNotifications', `resume:${pauseNotificationsInfo.schedule.to.toISOString()}`);
                } else {
                  await window.service.preference.set('pauseNotifications', undefined);
                }
                await window.service.notification.show({
                  title: 'Notifications resumed',
                  body: 'Notifications are now resumed.',
                });
                void window.remote.closeCurrentWindow();
              }}
            />
          </ListItem>
          {pauseNotificationsInfo.reason !== 'scheduled' && (
            <>
              <Divider />
              <PopUpMenuItem
                id='adjustTime'
                buttonElement={
                  <ListItem button>
                    <ListItemText primary='Adjust time' />
                    <ChevronRightIcon color='action' />
                  </ListItem>
                }
              >
                {quickShortcuts.map((shortcut) => (
                  <MenuItem
                    dense
                    key={shortcut.name}
                    onClick={() => {
                      pauseNotification(shortcut.calcDate());
                    }}
                  >
                    {shortcut.name}
                  </MenuItem>
                ))}
                <MenuItem
                  dense
                  onClick={() => {
                    showDateTimePickerSetter(true);
                  }}
                >
                  Custom...
                </MenuItem>
              </PopUpMenuItem>
            </>
          )}
          <Divider />
          <ListItemButton>
            <ListItemText
              primary={pauseNotificationsInfo.reason === 'scheduled' ? 'Adjust schedule...' : 'Pause notifications by schedule...'}
              onClick={async () => {
                await window.service.window.open(WindowNames.preferences, { gotoTab: PreferenceSections.notifications });
                void window.remote.closeCurrentWindow();
              }}
            />
          </ListItemButton>
        </List>
      );
    }

    return (
      <List subheader={<ListSubheader component='div'>Pause notifications</ListSubheader>}>
        {quickShortcuts.map((shortcut) => (
          <ListItemButton
            key={shortcut.name}
            onClick={() => {
              pauseNotification(shortcut.calcDate());
            }}
          >
            <ListItemText primary={shortcut.name} />
          </ListItemButton>
        ))}
        <ListItem
          button
          onClick={() => {
            showDateTimePickerSetter(true);
          }}
        >
          <ListItemText primary='Custom...' />
        </ListItem>
        <Divider />
        <ListItem button>
          <ListItemText
            primary='Pause notifications by schedule...'
            onClick={async () => {
              await window.service.window.open(WindowNames.preferences, { gotoTab: PreferenceSections.notifications });
              void window.remote.closeCurrentWindow();
            }}
          />
        </ListItem>
      </List>
    );
  };

  return (
    <Root>
      <div id='test' data-usage='For spectron automating testing' />
      <Helmet>
        <title>{t('ContextMenu.Notifications')}</title>
      </Helmet>
      {renderList()}
      <DateTimePicker
        value={new Date()}
        onChange={(tilDate) => {
          if (tilDate === null) return;
          pauseNotification(tilDate);
        }}
        label='Custom'
        open={showDateTimePicker}
        onOpen={() => {
          showDateTimePickerSetter(true);
        }}
        onClose={() => {
          showDateTimePickerSetter(false);
        }}
        disablePast
      />
    </Root>
  );
}
