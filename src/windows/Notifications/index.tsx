import { Helmet } from '@dr.pogodin/react-helmet';
import { styled } from '@mui/material/styles';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import ListRaw from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import PopupState, { bindMenu, bindTrigger } from 'material-ui-popup-state';

import ChevronRightIcon from '@mui/icons-material/ChevronRight';

import { ListItemButton } from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';

import { formatDate } from '@services/libs/formatDate';
import { useNotificationInfoObservable } from '@services/notifications/hooks';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { PreferenceSections } from '@services/preferences/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import nightBackgroundPng from '../../images/night-background.png';
import { quickShortcuts } from './quickShortcuts';

const Root = styled((props: React.ComponentProps<typeof Container>) => <Container {...props} />)`
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0;
`;

const List = styled((props: React.ComponentProps<typeof ListRaw>) => <ListRaw dense disablePadding {...props} />)`
  width: 100%;
`;

const PausingHeader = styled((props: React.ComponentProps<typeof ListItem>) => <ListItem {...props} />)`
  background: url(${nightBackgroundPng});
  height: 210px;
  background-size: 400px;
  align-items: flex-end;
`;

const PausingHeaderText = styled((props: React.ComponentProps<typeof ListItemText>) => <ListItemText {...props} />)`
  color: white;
`;

const pauseNotification = (tilDate: Date, t: ReturnType<typeof useTranslation>['t']): void => {
  void window.service.preference.set('pauseNotifications', `pause:${tilDate.toString()}`);
  void window.service.notification.show({
    title: t('Notification.Paused'),
    body: t('Notification.PausedUntil', { date: formatDate(tilDate) }),
  });
  void window.remote.closeCurrentWindow();
};

export default function Notifications(): React.JSX.Element {
  const { t } = useTranslation();
  const preference = usePreferenceObservable();
  const pauseNotificationsInfo = useNotificationInfoObservable();
  const [showDateTimePicker, showDateTimePickerSetter] = useState(false);
  if (preference === undefined) {
    return <Root>{t('Loading')}</Root>;
  }

  const renderList = (): React.JSX.Element => {
    if (pauseNotificationsInfo !== undefined) {
      return (
        <List>
          <PausingHeader>
            <PausingHeaderText primary={t('Notification.PausedUntil', { date: formatDate(new Date(pauseNotificationsInfo.tilDate)) })} />
          </PausingHeader>
          <ListItemButton>
            <ListItemText
              primary={t('Notification.Resume')}
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
                  title: t('Notification.Resumed'),
                  body: t('Notification.NotificationsNowResumed'),
                });
                void window.remote.closeCurrentWindow();
              }}
            />
          </ListItemButton>
          {pauseNotificationsInfo.reason !== 'scheduled' && (
            <>
              <Divider />
              <PopupState variant='popover' popupId='adjust-time-popup-menu'>
                {(popupState) => (
                  <>
                    <ListItemButton {...bindTrigger(popupState)}>
                      <ListItemText primary={t('Notification.AdjustTime')} />
                      <ChevronRightIcon color='action' />
                    </ListItemButton>
                    <Menu {...bindMenu(popupState)}>
                      {quickShortcuts.map((shortcut) => (
                        <MenuItem
                          dense
                          key={shortcut.key}
                          onClick={() => {
                            pauseNotification(shortcut.calcDate(), t);
                            popupState.close();
                          }}
                        >
                          {t(shortcut.key, { defaultValue: shortcut.name })}
                        </MenuItem>
                      ))}
                      <MenuItem
                        dense
                        onClick={() => {
                          showDateTimePickerSetter(true);
                          popupState.close();
                        }}
                      >
                        {t('Notification.Custom', { defaultValue: 'Custom...' })}
                      </MenuItem>
                    </Menu>
                  </>
                )}
              </PopupState>
            </>
          )}
          <Divider />
          <ListItemButton>
            <ListItemText
              primary={
                pauseNotificationsInfo.reason === 'scheduled'
                  ? t('Notification.AdjustSchedule', { defaultValue: 'Adjust schedule...' })
                  : t('Notification.PauseBySchedule', { defaultValue: 'Pause notifications by schedule...' })
              }
              onClick={async () => {
                await window.service.window.open(WindowNames.preferences, { preferenceGotoTab: PreferenceSections.notifications });
                void window.remote.closeCurrentWindow();
              }}
            />
          </ListItemButton>
        </List>
      );
    }

    return (
      <List subheader={<ListSubheader component='div'>{t('Notification.PauseNotifications', { defaultValue: 'Pause notifications' })}</ListSubheader>}>
        {quickShortcuts.map((shortcut) => (
          <ListItemButton
            key={shortcut.key}
            onClick={() => {
              pauseNotification(shortcut.calcDate(), t);
            }}
          >
            <ListItemText primary={t(shortcut.key, { defaultValue: shortcut.name })} />
          </ListItemButton>
        ))}
        <ListItemButton
          onClick={() => {
            showDateTimePickerSetter(true);
          }}
        >
          <ListItemText primary={t('Notification.Custom', { defaultValue: 'Custom...' })} />
        </ListItemButton>
        <Divider />
        <ListItemButton>
          <ListItemText
            primary={t('Notification.PauseBySchedule', { defaultValue: 'Pause notifications by schedule...' })}
            onClick={async () => {
              await window.service.window.open(WindowNames.preferences, { preferenceGotoTab: PreferenceSections.notifications });
              void window.remote.closeCurrentWindow();
            }}
          />
        </ListItemButton>
      </List>
    );
  };

  return (
    <Root>
      <Helmet>
        <title>{t('ContextMenu.Notifications')}</title>
      </Helmet>
      {renderList()}
      <DateTimePicker
        value={new Date()}
        onChange={(tilDate) => {
          if (tilDate === null) return;
          pauseNotification(tilDate, t);
        }}
        label={t('Notification.Custom', { defaultValue: 'Custom' })}
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
