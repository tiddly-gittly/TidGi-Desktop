import { Divider, List, Switch } from '@mui/material';
import { useTranslation } from 'react-i18next';

import { ListItem, ListItemText } from '@/components/ListItem';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { Paper, SectionTitle } from '../PreferenceComponents';
import type { ISectionProps } from '../useSections';

export function Performance(props: Required<ISectionProps>): React.JSX.Element {
  const { t } = useTranslation();

  const preference = usePreferenceObservable();

  return (
    <>
      <SectionTitle ref={props.sections.performance.ref}>{t('Preference.Performance')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {preference === undefined ? <ListItem>{t('Loading')}</ListItem> : (
            <>
              <ListItem
                secondaryAction={
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.hibernateUnusedWorkspacesAtLaunch}
                    onChange={async (event) => {
                      await window.service.preference.set('hibernateUnusedWorkspacesAtLaunch', event.target.checked);
                    }}
                  />
                }
              >
                <ListItemText primary={t('Preference.HibernateAllUnusedWorkspaces')} secondary={t('Preference.HibernateAllUnusedWorkspacesDescription')} />
              </ListItem>

              <Divider />
              <ListItem
                secondaryAction={
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.useHardwareAcceleration}
                    onChange={async (event) => {
                      await window.service.preference.set('useHardwareAcceleration', event.target.checked);
                      props.requestRestartCountDown();
                    }}
                  />
                }
              >
                <ListItemText primary={t('Preference.hardwareAcceleration')} />
              </ListItem>
            </>
          )}
        </List>
      </Paper>
    </>
  );
}
