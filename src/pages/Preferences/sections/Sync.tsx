import { Divider, List, ListItemSecondaryAction, Switch } from '@mui/material';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import fromUnixTime from 'date-fns/fromUnixTime';
import setDate from 'date-fns/setDate';
import setMonth from 'date-fns/setMonth';
import setYear from 'date-fns/setYear';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { TokenForm } from '../../../components/TokenForm';

import { ListItem, ListItemText } from '@/components/ListItem';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { WindowNames } from '@services/windows/WindowProperties';
import { Paper, SectionTitle, TimePickerContainer } from '../PreferenceComponents';
import type { ISectionProps } from '../useSections';

export function Sync(props: Required<ISectionProps>): JSX.Element {
  const { t } = useTranslation();

  const preference = usePreferenceObservable();

  return (
    <>
      <SectionTitle ref={props.sections.sync.ref}>{t('Preference.Sync')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {preference === undefined ? <ListItem>{t('Loading')}</ListItem> : (
            <>
              <ListItem>
                <TokenForm />
              </ListItem>
              <Divider />
              <ListItem>
                <ListItemText primary={`${t('Preference.SyncBeforeShutdown')} (Mac/Linux)`} secondary={t('Preference.SyncBeforeShutdownDescription')} />
                <ListItemSecondaryAction>
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.syncBeforeShutdown}
                    onChange={async (event) => {
                      await window.service.preference.set('syncBeforeShutdown', event.target.checked);
                      props.requestRestartCountDown();
                    }}
                  />
                </ListItemSecondaryAction>
              </ListItem>
              <ListItem>
                <ListItemText primary={`${t('Preference.SyncOnlyWhenNoDraft')}`} secondary={t('Preference.SyncOnlyWhenNoDraftDescription')} />
                <ListItemSecondaryAction>
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.syncOnlyWhenNoDraft}
                    onChange={async (event) => {
                      await window.service.preference.set('syncOnlyWhenNoDraft', event.target.checked);
                    }}
                  />
                </ListItemSecondaryAction>
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
                    value={fromUnixTime(preference.syncDebounceInterval / 1000 + new Date().getTimezoneOffset() * 60)}
                    onChange={async (date) => {
                      if (date === null) throw new Error(`date is null`);
                      const timeWithoutDate = setDate(setMonth(setYear(date, 1970), 0), 1);
                      const utcTime = (timeWithoutDate.getTime() / 1000 - new Date().getTimezoneOffset() * 60) * 1000;
                      await window.service.preference.set('syncDebounceInterval', utcTime);
                      props.requestRestartCountDown();
                    }}
                    onClose={async () => {
                      await window.service.window.updateWindowMeta(WindowNames.preferences, { preventClosingWindow: false });
                    }}
                    onOpen={async () => {
                      await window.service.window.updateWindowMeta(WindowNames.preferences, { preventClosingWindow: true });
                    }}
                  />
                </TimePickerContainer>
              </ListItem>
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
