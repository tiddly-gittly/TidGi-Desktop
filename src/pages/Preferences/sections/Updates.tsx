import { useTranslation } from 'react-i18next';
import { Divider, List, ListItemSecondaryAction, Switch } from '@material-ui/core';
import ChevronRightIcon from '@material-ui/icons/ChevronRight';

import type { ISectionProps } from '../useSections';
import { Paper, SectionTitle, ListItem, ListItemText } from '../PreferenceComponents';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { useUpdaterObservable, getUpdaterMessage } from '@services/updater/hooks';
import { IUpdaterStatus } from '@services/updater/interface';
import { latestStableUpdateUrl } from '@/constants/urls';

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
                onClick={
                  updaterMetaData.status === IUpdaterStatus.updateAvailable
                    ? async () => await window.service.native.open(updaterMetaData.info?.latestReleasePageUrl ?? latestStableUpdateUrl)
                    : async () => await window.service.updater.checkForUpdates()
                }
                disabled={updaterMetaData.status === IUpdaterStatus.checkingForUpdate || updaterMetaData.status === IUpdaterStatus.downloadProgress}>
                {updaterMetaData.status !== undefined && (
                  <ListItemText
                    primary={t(`Updater.${updaterMetaData.status}`)}
                    secondary={getUpdaterMessage(updaterMetaData.status, updaterMetaData.info, t)}
                  />
                )}
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
                      await window.service.updater.checkForUpdates();
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
