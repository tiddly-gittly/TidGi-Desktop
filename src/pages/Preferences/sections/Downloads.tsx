import { Divider, List, ListItemSecondaryAction, Switch } from '@material-ui/core';
import ChevronRightIcon from '@material-ui/icons/ChevronRight';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { usePreferenceObservable } from '@services/preferences/hooks';
import { ListItem, ListItemText, Paper, SectionTitle } from '../PreferenceComponents';
import type { ISectionProps } from '../useSections';

export function Downloads(props: Required<ISectionProps>): JSX.Element {
  const { t } = useTranslation();

  const preference = usePreferenceObservable();

  return (
    <>
      <SectionTitle ref={props.sections.downloads.ref}>{t('Preference.Downloads')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {preference === undefined ? <ListItem>{t('Loading')}</ListItem> : (
            <>
              <ListItem
                button
                onClick={() => {
                  window.service.native
                    .pickDirectory(preference.downloadPath)
                    .then(async (filePaths) => {
                      if (filePaths.length > 0) {
                        await window.service.preference.set('downloadPath', filePaths[0]);
                      }
                    })
                    .catch((error: Error) => {
                      console.log(error); // eslint-disable-line no-console
                    });
                }}
              >
                <ListItemText primary={t('Preference.DownloadLocation')} secondary={preference.downloadPath} />
                <ChevronRightIcon color='action' />
              </ListItem>
              <Divider />
              <ListItem>
                <ListItemText primary={t('Preference.AskDownloadLocation')} />
                <ListItemSecondaryAction>
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.askForDownloadPath}
                    onChange={async (event) => {
                      await window.service.preference.set('askForDownloadPath', event.target.checked);
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
