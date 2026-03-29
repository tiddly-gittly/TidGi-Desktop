import { Switch } from '@mui/material';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { useTranslation } from 'react-i18next';

import { ListItemText } from '@/components/ListItem';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { WindowNames } from '@services/windows/WindowProperties';
import { ListItemVertical, TimePickerContainer } from '../PreferenceComponents';

export function NotificationScheduleItem(): React.JSX.Element | null {
  const { t } = useTranslation();
  const preference = usePreferenceObservable();

  if (preference === undefined) return null;

  return (
    <ListItemVertical>
      <ListItemText primary={t('Preference.NotificationsDisableSchedule')} />
      <TimePickerContainer>
        <TimePicker
          label='from'
          value={new Date(preference.pauseNotificationsByScheduleFrom)}
          onChange={async (d) => {
            if (d !== null && d instanceof Date) {
              await window.service.preference.set('pauseNotificationsByScheduleFrom', d.toString());
            }
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
          onChange={async (d) => {
            if (d !== null && d instanceof Date) {
              await window.service.preference.set('pauseNotificationsByScheduleTo', d.toString());
            }
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
      <Switch
        edge='end'
        color='primary'
        checked={preference.pauseNotificationsBySchedule}
        onChange={async (event) => {
          await window.service.preference.set('pauseNotificationsBySchedule', event.target.checked);
        }}
      />
    </ListItemVertical>
  );
}
