import React from 'react';
import { useTranslation } from 'react-i18next';
import fromUnixTime from 'date-fns/fromUnixTime';
import setYear from 'date-fns/setYear';
import setMonth from 'date-fns/setMonth';
import setDate from 'date-fns/setDate';
import TimePicker from '@material-ui/lab/TimePicker';
import { Divider, List, ListItem, ListItemSecondaryAction, ListItemText, Switch } from '@material-ui/core';

import { TokenForm } from '../../../components/TokenForm';

import type { ISectionProps } from '../useSections';
import { Paper, SectionTitle, TextField, TimePickerContainer } from '../PreferenceComponents';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { WindowNames } from '@services/windows/WindowProperties';

export function Sync(props: Required<ISectionProps>): JSX.Element {
  const { t } = useTranslation();

  const preference = usePreferenceObservable();

  return (
    <>
      <SectionTitle ref={props.sections.sync.ref}>{t('Preference.Sync')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {preference === undefined ? (
            <ListItem>{t('Loading')}</ListItem>
          ) : (
            <>
              <ListItem>
                <TokenForm />
              </ListItem>
              <Divider />
              <ListItem>
                <ListItemText primary={`${t('Preference.SyncBeforeShutdown')} (Mac/Linux)`} secondary={t('Preference.SyncBeforeShutdownDescription')} />
                <ListItemSecondaryAction>
                  <Switch
                    edge="end"
                    color="primary"
                    checked={preference.syncBeforeShutdown}
                    onChange={async (event) => {
                      await window.service.preference.set('syncBeforeShutdown', event.target.checked);
                      props.requestRestartCountDown();
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
                    openTo="hours"
                    views={['hours', 'minutes', 'seconds']}
                    inputFormat="HH:mm:ss"
                    mask="__:__:__"
                    renderInput={(timeProps) => <TextField {...timeProps} />}
                    value={fromUnixTime(preference.syncDebounceInterval / 1000 + new Date().getTimezoneOffset() * 60)}
                    onChange={async (date) => {
                      if (date === null) throw new Error(`date is null`);
                      const timeWithoutDate = setDate(setMonth(setYear(date, 1970), 0), 1);
                      const utcTime = (timeWithoutDate.getTime() / 1000 - new Date().getTimezoneOffset() * 60) * 1000;
                      await window.service.preference.set('syncDebounceInterval', utcTime);
                      props.requestRestartCountDown();
                    }}
                    onClose={async () => await window.service.window.updateWindowMeta(WindowNames.preferences, { preventClosingWindow: false })}
                    onOpen={async () => await window.service.window.updateWindowMeta(WindowNames.preferences, { preventClosingWindow: true })}
                  />
                </TimePickerContainer>
              </ListItem>
            </>
          )}
        </List>
      </Paper>
    </>
  );
}
