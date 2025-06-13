import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Divider, List, ListItemButton, Switch } from '@mui/material';
import { useTranslation } from 'react-i18next';

import { ListItem, ListItemText } from '@/components/ListItem';
import { latestStableUpdateUrl } from '@/constants/urls';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { getUpdaterMessage, useUpdaterObservable } from '@services/updater/hooks';
import { IUpdaterStatus } from '@services/updater/interface';
import { Paper, SectionTitle } from '../PreferenceComponents';
import type { ISectionProps } from '../useSections';

export function Updates(props: Required<ISectionProps>): React.JSX.Element {
  const { t } = useTranslation();

  const preference = usePreferenceObservable();
  const updaterMetaData = useUpdaterObservable();

  return (
    <>
      <SectionTitle ref={props.sections.updates.ref}>{t('Preference.Network')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {preference === undefined || updaterMetaData === undefined ? <ListItem>{t('Loading')}</ListItem> : (
            <>
              <ListItemButton
                onClick={updaterMetaData.status === IUpdaterStatus.updateAvailable
                  ? async () => {
                    await window.service.native.openURI(updaterMetaData.info?.latestReleasePageUrl ?? latestStableUpdateUrl);
                  }
                  : async () => {
                    await window.service.updater.checkForUpdates();
                  }}
                disabled={updaterMetaData.status === IUpdaterStatus.checkingForUpdate || updaterMetaData.status === IUpdaterStatus.downloadProgress}
              >
                {updaterMetaData.status !== undefined && (
                  <ListItemText
                    primary={t(`Updater.${updaterMetaData.status}`)}
                    secondary={getUpdaterMessage(updaterMetaData.status, updaterMetaData.info, t)}
                  />
                )}
                <ChevronRightIcon color='action' />
              </ListItemButton>
              <Divider />
              <ListItem
                secondaryAction={
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.allowPrerelease}
                    onChange={async (event) => {
                      await window.service.preference.set('allowPrerelease', event.target.checked);
                      await window.service.updater.checkForUpdates();
                    }}
                  />
                }
              >
                <ListItemText primary={t('Preference.ReceivePreReleaseUpdates')} />
              </ListItem>
            </>
          )}
        </List>
      </Paper>
    </>
  );
}
