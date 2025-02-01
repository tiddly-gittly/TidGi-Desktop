import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Divider, List, ListItemButton, Switch } from '@mui/material';
import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { ListItem, ListItemText } from '@/components/ListItem';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { Link, Paper, SectionTitle } from '../PreferenceComponents';
import type { ISectionProps } from '../useSections';

export function PrivacyAndSecurity(props: Required<ISectionProps>): React.JSX.Element {
  const { t } = useTranslation();

  const preference = usePreferenceObservable();

  return (
    <>
      <SectionTitle ref={props.sections.privacy.ref}>{t('Preference.PrivacyAndSecurity')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {preference === undefined ? <ListItem>{t('Loading')}</ListItem> : (
            <>
              <ListItem
                secondaryAction={
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.shareWorkspaceBrowsingData}
                    onChange={async (event) => {
                      await window.service.preference.set('shareWorkspaceBrowsingData', event.target.checked);
                      props.requestRestartCountDown();
                    }}
                  />
                }
              >
                <ListItemText primary={t('Preference.ShareBrowsingData')} />
              </ListItem>
              <Divider />
              <ListItem
                secondaryAction={
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.ignoreCertificateErrors}
                    onChange={async (event) => {
                      await window.service.preference.set('ignoreCertificateErrors', event.target.checked);
                      props.requestRestartCountDown();
                    }}
                  />
                }
              >
                <ListItemText
                  primary={t('Preference.IgnoreCertificateErrors')}
                  secondary={
                    <Trans t={t} i18nKey='Preference.IgnoreCertificateErrorsDescription'>
                      <span>Not recommended.</span>
                      <Link
                        onClick={async () => {
                          await window.service.native.openURI('https://groups.google.com/a/chromium.org/d/msg/security-dev/mB2KJv_mMzM/ddMteO9RjXEJ');
                        }}
                        onKeyDown={(event: React.KeyboardEvent<HTMLSpanElement>) => {
                          if (event.key !== 'Enter') return;
                          void window.service.native.openURI('https://groups.google.com/a/chromium.org/d/msg/security-dev/mB2KJv_mMzM/ddMteO9RjXEJ');
                        }}
                      >
                        Learn more
                      </Link>
                      .
                    </Trans>
                  }
                />
              </ListItem>
              <Divider />
              <ListItemButton
                onClick={async () => {
                  await window.service.workspaceView.clearBrowsingDataWithConfirm();
                }}
              >
                <ListItemText primary={t('Preference.ClearBrowsingData')} secondary={t('Preference.ClearBrowsingDataDescription')} />
                <ChevronRightIcon color='action' />
              </ListItemButton>
              <Divider />
              <ListItemButton
                onClick={async () => {
                  await window.service.native.openURI('https://github.com/tiddly-gittly/TidGi-Desktop/blob/master/PrivacyPolicy.md');
                }}
              >
                <ListItemText primary='Privacy Policy' />
              </ListItemButton>
            </>
          )}
        </List>
      </Paper>
    </>
  );
}
