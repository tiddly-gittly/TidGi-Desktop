import React from 'react';
import { useTranslation } from 'react-i18next';
import { Divider, List, ListItem, ListItemSecondaryAction, ListItemText, Switch } from '@material-ui/core';
import ChevronRightIcon from '@material-ui/icons/ChevronRight';

import type { ISectionProps } from '../useSections';
import { Paper, SectionTitle } from '../PreferenceComponents';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { getUpdaterDesc, useUpdaterObservable } from '@services/updater/hooks';

export function Updates(props: Required<ISectionProps>): JSX.Element {
  const { t } = useTranslation();

  const preference = usePreferenceObservable();
  const updaterMetaData = useUpdaterObservable();

  return (
    <>
      <SectionTitle ref={props.sections.updates.ref}>{t('Preference.Network')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {preference === undefined || updaterMetaData === undefined ? (
            <ListItem>{t('Loading')}</ListItem>
          ) : (
            <>
              <ListItem
                button
                onClick={async () => await window.service.updater.checkForUpdates(false)}
                disabled={
                  updaterMetaData.status === 'checking-for-update' ||
                  updaterMetaData.status === 'download-progress' ||
                  updaterMetaData.status === 'update-available'
                }>
                <ListItemText
                  primary={updaterMetaData.status === 'update-downloaded' ? t('Preference.RestartToApplyUpdates') : t('ContextMenu.CheckForUpdates')}
                  secondary={getUpdaterDesc(updaterMetaData.status, updaterMetaData.info)}
                />
                <ChevronRightIcon color="action" />
              </ListItem>
              <Divider />
              <ListItem>
                <ListItemText primary={t('Preference.ReceivePreReleaseUpdates')} />
                <ListItemSecondaryAction>
                  <Switch
                    edge="end"
                    color="primary"
                    checked={preference.allowPrerelease}
                    onChange={async (event) => {
                      await window.service.preference.set('allowPrerelease', event.target.checked);
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
