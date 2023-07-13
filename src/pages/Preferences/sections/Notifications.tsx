import { Trans, useTranslation } from 'react-i18next';
import semver from 'semver';

import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Divider, List, ListItemSecondaryAction, Switch } from '@mui/material';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';

import { ListItem, ListItemText } from '@/components/ListItem';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { WindowNames } from '@services/windows/WindowProperties';
import { Link, ListItemVertical, Paper, SectionTitle, TimePickerContainer } from '../PreferenceComponents';
import type { ISectionProps } from '../useSections';

export function Notifications(props: Required<ISectionProps>): JSX.Element {
  const { t } = useTranslation();

  const preference = usePreferenceObservable();
  const [platform, oSVersion] = usePromiseValue<[string | undefined, string | undefined], [string | undefined, string | undefined]>(
    async () =>
      await Promise.all([window.service.context.get('platform'), window.service.context.get('oSVersion')]).catch((error) => {
        console.error(error);
        return [undefined, undefined];
      }),
    [undefined, undefined],
  );

  return (
    <>
      <SectionTitle ref={props.sections.notifications.ref}>{t('Preference.Notifications')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {preference === undefined || platform === undefined ? <ListItem>{t('Loading')}</ListItem> : (
            <>
              <ListItem
                button
                onClick={async () => {
                  await window.service.window.open(WindowNames.notifications);
                }}
              >
                <ListItemText primary={t('Preference.NotificationsDetail')} />
                <ChevronRightIcon color='action' />
              </ListItem>
              <Divider />
              <ListItemVertical>
                <ListItemText primary={t('Preference.NotificationsDisableSchedule')} />
                <TimePickerContainer>
                  <TimePicker
                    label='from'
                    value={new Date(preference.pauseNotificationsByScheduleFrom)}
                    onChange={async (d: Date | null) => {
                      await window.service.preference.set('pauseNotificationsByScheduleFrom', (d ?? '').toString());
                    }}
                    onClose={async () => {
                      await window.service.window.updateWindowMeta(WindowNames.preferences, { preventClosingWindow: false });
                    }}
                    onOpen={async () => {
                      await window.service.window.updateWindowMeta(WindowNames.preferences, { preventClosingWindow: true });
                    }}
                    disabled={!preference.pauseNotificationsBySchedule}
                  />
                  <TimePicker
                    label='to'
                    value={new Date(preference.pauseNotificationsByScheduleTo)}
                    onChange={async (d: Date | null) => {
                      await window.service.preference.set('pauseNotificationsByScheduleTo', (d ?? '').toString());
                    }}
                    onClose={async () => {
                      await window.service.window.updateWindowMeta(WindowNames.preferences, { preventClosingWindow: false });
                    }}
                    onOpen={async () => {
                      await window.service.window.updateWindowMeta(WindowNames.preferences, { preventClosingWindow: true });
                    }}
                    disabled={!preference.pauseNotificationsBySchedule}
                  />
                </TimePickerContainer>
                ({window.Intl.DateTimeFormat().resolvedOptions().timeZone})
                <ListItemSecondaryAction>
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.pauseNotificationsBySchedule}
                    onChange={async (event) => {
                      await window.service.preference.set('pauseNotificationsBySchedule', event.target.checked);
                    }}
                  />
                </ListItemSecondaryAction>
              </ListItemVertical>
              <Divider />
              <ListItem>
                <ListItemText primary={t('Preference.NotificationsMuteAudio')} />
                <ListItemSecondaryAction>
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.pauseNotificationsMuteAudio}
                    onChange={async (event) => {
                      await window.service.preference.set('pauseNotificationsMuteAudio', event.target.checked);
                    }}
                  />
                </ListItemSecondaryAction>
              </ListItem>
              <Divider />
              <ListItem>
                <ListItemText primary='Show unread count badge' />
                <ListItemSecondaryAction>
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.unreadCountBadge}
                    onChange={async (event) => {
                      await window.service.preference.set('unreadCountBadge', event.target.checked);
                      props.requestRestartCountDown();
                    }}
                  />
                </ListItemSecondaryAction>
              </ListItem>
              <Divider />
              <ListItem
                button
                onClick={() => {
                  void window.service.notification.show({
                    title: t('Preference.TestNotification'),
                    body: t('Preference.ItIsWorking'),
                  });
                }}
              >
                <ListItemText
                  primary={t('Preference.TestNotification')}
                  secondary={(() => {
                    // only show this message on macOS Catalina 10.15 & above
                    if (platform === 'darwin' && oSVersion !== undefined && semver.gte(oSVersion, '10.15.0')) {
                      return (
                        <Trans t={t} i18nKey='Preference.TestNotificationDescription'>
                          <span>
                            If notifications dont show up, make sure you enable notifications in
                            <b>macOS Preferences → Notifications → TidGi</b>.
                          </span>
                        </Trans>
                      );
                    }
                  })()}
                />
                <ChevronRightIcon color='action' />
              </ListItem>
              <Divider />
              <ListItem>
                <ListItemText
                  secondary={
                    <Trans t={t} i18nKey='Preference.HowToEnableNotifications'>
                      <span>
                        TidGi supports notifications out of the box. But for some cases, to receive notifications, you will need to manually configure additional web app settings.
                      </span>
                      <Link
                        onClick={async () => {
                          await window.service.native.open('https://github.com/atomery/webcatalog/wiki/How-to-Enable-Notifications-in-Web-Apps');
                        }}
                        onKeyDown={(event: React.KeyboardEvent<HTMLSpanElement>) => {
                          if (event.key !== 'Enter') return;
                          void window.service.native.open('https://github.com/atomery/webcatalog/wiki/How-to-Enable-Notifications-in-Web-Apps');
                        }}
                      >
                        Learn more
                      </Link>
                      <span>.</span>
                    </Trans>
                  }
                />
              </ListItem>
            </>
          )}
        </List>
      </Paper>
    </>
  );
}
