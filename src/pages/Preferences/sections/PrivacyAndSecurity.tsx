import { Divider, List, ListItemSecondaryAction, Switch } from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { usePreferenceObservable } from '@services/preferences/hooks';
import { Link, Paper, SectionTitle } from '../PreferenceComponents';
import { ListItem, ListItemText } from '@/components/ListItem';
import type { ISectionProps } from '../useSections';

export function PrivacyAndSecurity(props: Required<ISectionProps>): JSX.Element {
  const { t } = useTranslation();

  const preference = usePreferenceObservable();

  return (
    <>
      <SectionTitle ref={props.sections.privacy.ref}>{t('Preference.PrivacyAndSecurity')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {preference === undefined ? <ListItem>{t('Loading')}</ListItem> : (
            <>
              <ListItem>
                <ListItemText primary={t('Preference.ShareBrowsingData')} />
                <ListItemSecondaryAction>
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.shareWorkspaceBrowsingData}
                    onChange={async (event) => {
                      await window.service.preference.set('shareWorkspaceBrowsingData', event.target.checked);
                      props.requestRestartCountDown();
                    }}
                  />
                </ListItemSecondaryAction>
              </ListItem>
              <Divider />
              <ListItem>
                <ListItemText
                  primary={t('Preference.IgnoreCertificateErrors')}
                  secondary={
                    <Trans t={t} i18nKey='Preference.IgnoreCertificateErrorsDescription'>
                      <span>Not recommended.</span>
                      <Link
                        onClick={async () => {
                          await window.service.native.open('https://groups.google.com/a/chromium.org/d/msg/security-dev/mB2KJv_mMzM/ddMteO9RjXEJ');
                        }}
                        onKeyDown={(event: React.KeyboardEvent<HTMLSpanElement>) => {
                          if (event.key !== 'Enter') return;
                          void window.service.native.open('https://groups.google.com/a/chromium.org/d/msg/security-dev/mB2KJv_mMzM/ddMteO9RjXEJ');
                        }}
                      >
                        Learn more
                      </Link>
                      .
                    </Trans>
                  }
                />
                <ListItemSecondaryAction>
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.ignoreCertificateErrors}
                    onChange={async (event) => {
                      await window.service.preference.set('ignoreCertificateErrors', event.target.checked);
                      props.requestRestartCountDown();
                    }}
                  />
                </ListItemSecondaryAction>
              </ListItem>
              <Divider />
              <ListItem
                button
                onClick={async () => {
                  await window.service.workspaceView.clearBrowsingDataWithConfirm();
                }}
              >
                <ListItemText primary={t('Preference.ClearBrowsingData')} secondary={t('Preference.ClearBrowsingDataDescription')} />
                <ChevronRightIcon color='action' />
              </ListItem>
              <Divider />
              <ListItem
                button
                onClick={async () => {
                  await window.service.native.open('https://github.com/tiddly-gittly/TidGi-Desktop/blob/master/PrivacyPolicy.md');
                }}
              >
                <ListItemText primary='Privacy Policy' />
              </ListItem>
            </>
          )}
        </List>
      </Paper>
    </>
  );
}
