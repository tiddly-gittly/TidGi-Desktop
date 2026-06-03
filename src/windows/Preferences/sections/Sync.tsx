import { Divider, List, Switch, TextField } from '@mui/material';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { renderTimeViewClock } from '@mui/x-date-pickers/timeViewRenderers';
import { useTranslation } from 'react-i18next';

import { TokenForm } from '../../../components/TokenForm';

import { ListItem, ListItemText } from '@/components/ListItem';
import type { ICustomSectionProps } from '@services/preferences/definitions/types';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { WindowNames } from '@services/windows/WindowProperties';
import { Paper, SectionTitle, TimePickerContainer } from '../PreferenceComponents';

export function Sync(props: ICustomSectionProps): React.JSX.Element {
  const { t } = useTranslation();

  const preference = usePreferenceObservable();

  return (
    <>
      <SectionTitle ref={props.sectionRef}>{t('Preference.Sync')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {preference === undefined ? <ListItem>{t('Loading')}</ListItem> : (
            <>
              <ListItem>
                <TokenForm />
              </ListItem>
              <Divider />
              <ListItem
                secondaryAction={
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.syncBeforeShutdown}
                    onChange={async (event) => {
                      await window.service.preference.set('syncBeforeShutdown', event.target.checked);
                      props.onNeedsRestart();
                    }}
                  />
                }
              >
                <ListItemText primary={`${t('Preference.SyncBeforeShutdown')} (Mac/Linux)`} secondary={t('Preference.SyncBeforeShutdownDescription')} />
              </ListItem>
              <ListItem
                secondaryAction={
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.syncOnlyWhenNoDraft}
                    onChange={async (event) => {
                      await window.service.preference.set('syncOnlyWhenNoDraft', event.target.checked);
                    }}
                  />
                }
              >
                <ListItemText primary={t('Preference.SyncOnlyWhenNoDraft')} secondary={t('Preference.SyncOnlyWhenNoDraftDescription')} />
              </ListItem>
              <Divider />
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
                      if (date === null) throw new Error(`date is null`);
                      // Extract hours, minutes, seconds from the date and convert to milliseconds
                      // Must use UTC methods because the Date was constructed with Date.UTC
                      const hours = date.getUTCHours();
                      const minutes = date.getUTCMinutes();
                      const seconds = date.getUTCSeconds();
                      const intervalMs = (hours * 60 * 60 + minutes * 60 + seconds) * 1000;
                      await window.service.preference.set('syncDebounceInterval', intervalMs);
                      props.onNeedsRestart();
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
              <Divider />
              <ListItem
                secondaryAction={
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.aiGenerateBackupTitle}
                    onChange={async (event) => {
                      await window.service.preference.set('aiGenerateBackupTitle', event.target.checked);
                    }}
                  />
                }
              >
                <ListItemText primary={t('Preference.AIGenerateBackupTitle')} secondary={t('Preference.AIGenerateBackupTitleDescription')} />
              </ListItem>
              {preference.aiGenerateBackupTitle && (
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
                      // Reset to current preference value if invalid
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
              )}
              <Divider />
              <ListItem>
                <ListItemText
                  primary={`${t('Preference.MoreWorkspaceSyncSettings')} (Mac/Linux)`}
                  secondary={t('Preference.MoreWorkspaceSyncSettingsDescription')}
                />
              </ListItem>
            </>
          )}
        </List>
      </Paper>
    </>
  );
}
