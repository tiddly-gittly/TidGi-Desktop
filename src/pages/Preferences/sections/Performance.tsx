import { Divider, List, ListItemSecondaryAction, Switch } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { ListItem, ListItemText } from '@/components/ListItem';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { Paper, SectionTitle } from '../PreferenceComponents';
import type { ISectionProps } from '../useSections';

export function Performance(props: Required<ISectionProps>): JSX.Element {
  const { t } = useTranslation();

  const preference = usePreferenceObservable();

  return (
    <>
      <SectionTitle ref={props.sections.performance.ref}>{t('Preference.Performance')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {preference === undefined ? <ListItem>{t('Loading')}</ListItem> : (
            <>
              <ListItem>
                <ListItemText primary={t('Preference.HibernateAllUnusedWorkspaces')} secondary={t('Preference.HibernateAllUnusedWorkspacesDescription')} />
                <ListItemSecondaryAction>
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.hibernateUnusedWorkspacesAtLaunch}
                    onChange={async (event) => {
                      await window.service.preference.set('hibernateUnusedWorkspacesAtLaunch', event.target.checked);
                    }}
                  />
                </ListItemSecondaryAction>
              </ListItem>

              <Divider />
              <ListItem>
                <ListItemText primary={t('Preference.hardwareAcceleration')} />
                <ListItemSecondaryAction>
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.useHardwareAcceleration}
                    onChange={async (event) => {
                      await window.service.preference.set('useHardwareAcceleration', event.target.checked);
                      props.requestRestartCountDown();
                    }}
                  />
                </ListItemSecondaryAction>
              </ListItem>
            </>
          )}
        </List>
      </Paper>
    </>
  );
}
