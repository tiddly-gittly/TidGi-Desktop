import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Divider, List, ListItemButton, Switch } from '@mui/material';
import { useTranslation } from 'react-i18next';

import { ListItem, ListItemText } from '@/components/ListItem';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { Paper, SectionTitle } from '../PreferenceComponents';
import type { ISectionProps } from '../useSections';

export function Downloads(props: Required<ISectionProps>): React.JSX.Element {
  const { t } = useTranslation();

  const preference = usePreferenceObservable();

  return (
    <>
      <SectionTitle ref={props.sections.downloads.ref}>{t('Preference.Downloads')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {preference === undefined ? <ListItem>{t('Loading')}</ListItem> : (
            <>
              <ListItemButton
                onClick={() => {
                  window.service.native
                    .pickDirectory(preference.downloadPath)
                    .then(async (filePaths) => {
                      if (filePaths.length > 0) {
                        await window.service.preference.set('downloadPath', filePaths[0]);
                      }
                    })
                    .catch((error: Error) => {
                      console.log(error);
                    });
                }}
              >
                <ListItemText primary={t('Preference.DownloadLocation')} secondary={preference.downloadPath} />
                <ChevronRightIcon color='action' />
              </ListItemButton>
              <Divider />
              <ListItem
                secondaryAction={
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.askForDownloadPath}
                    onChange={async (event) => {
                      await window.service.preference.set('askForDownloadPath', event.target.checked);
                    }}
                  />
                }
              >
                <ListItemText primary={t('Preference.AskDownloadLocation')} />
              </ListItem>
            </>
          )}
        </List>
      </Paper>
    </>
  );
}
