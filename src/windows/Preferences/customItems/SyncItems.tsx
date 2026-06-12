import { TextField } from '@mui/material';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { renderTimeViewClock } from '@mui/x-date-pickers/timeViewRenderers';
import { useTranslation } from 'react-i18next';

import { ListItem, ListItemText } from '@/components/ListItem';
import { TokenForm } from '@/components/TokenForm';
import type { ICustomItemProps } from '@services/preferences/definitions/types';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { WindowNames } from '@services/windows/WindowProperties';
import { TimePickerContainer } from '../PreferenceComponents';

export function SyncTokenFormItem(): React.JSX.Element {
  return (
    <ListItem>
      <TokenForm />
    </ListItem>
  );
}

export function SyncIntervalItem({ onNeedsRestart }: ICustomItemProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const preference = usePreferenceObservable();

  if (preference === undefined) return null;

  return (
    <ListItem>
      <ListItemText primary={t('Preference.SyncInterval')} secondary={t('Preference.SyncIntervalDescription')} />
      <TimePickerContainer>
        <TimePicker
          ampm={false}
          openTo='hours'
          views={['hours', 'minutes', 'seconds']}
          format='HH:mm:ss'
          value={new Date(Date.UTC(1970, 0, 1, 0, 0, 0, preference.syncDebounceInterval))}
          onChange={async (date) => {
            if (date === null) throw new Error('date is null');
            const hours = date.getUTCHours();
            const minutes = date.getUTCMinutes();
            const seconds = date.getUTCSeconds();
            const intervalMs = (hours * 60 * 60 + minutes * 60 + seconds) * 1000;
            await window.service.preference.set('syncDebounceInterval', intervalMs);
            onNeedsRestart();
          }}
          onClose={async () => {
            await window.service.window.updateWindowMeta(WindowNames.preferences, { preventClosingWindow: false });
          }}
          onOpen={async () => {
            await window.service.window.updateWindowMeta(WindowNames.preferences, { preventClosingWindow: true });
          }}
          viewRenderers={{
            hours: renderTimeViewClock,
            minutes: renderTimeViewClock,
            seconds: renderTimeViewClock,
          }}
        />
      </TimePickerContainer>
    </ListItem>
  );
}

export function SyncAiTimeoutItem(): React.JSX.Element | null {
  const { t } = useTranslation();
  const preference = usePreferenceObservable();

  if (preference === undefined || !preference.aiGenerateBackupTitle) return null;

  return (
    <ListItem>
      <ListItemText primary={t('Preference.AIGenerateBackupTitleTimeout')} secondary={t('Preference.AIGenerateBackupTitleTimeoutDescription')} />
      <TextField
        type='number'
        value={preference.aiGenerateBackupTitleTimeout / 1000}
        onChange={async (event) => {
          const seconds = Number.parseInt(event.target.value, 10);
          if (!Number.isNaN(seconds) && seconds > 0 && seconds <= 60) {
            await window.service.preference.set('aiGenerateBackupTitleTimeout', seconds * 1000);
          }
        }}
        onBlur={async (event) => {
          const seconds = Number.parseInt(event.target.value, 10);
          if (Number.isNaN(seconds) || seconds <= 0 || seconds > 60) {
            event.target.value = String(preference.aiGenerateBackupTitleTimeout / 1000);
          }
        }}
        slotProps={{
          htmlInput: {
            min: 1,
            max: 60,
            step: 1,
          },
        }}
        sx={{ width: 100 }}
        size='small'
        label={t('Preference.Seconds')}
      />
    </ListItem>
  );
}

export function SyncMoreSettingsItem(): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <ListItem>
      <ListItemText
        primary={`${t('Preference.MoreWorkspaceSyncSettings')} (Mac/Linux)`}
        secondary={t('Preference.MoreWorkspaceSyncSettingsDescription')}
      />
    </ListItem>
  );
}
