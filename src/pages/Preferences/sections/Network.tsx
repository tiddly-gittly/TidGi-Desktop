import { Divider, List, ListItemSecondaryAction, Switch, TextField } from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ListItem, ListItemText } from '@/components/ListItem';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { Paper, SectionTitle } from '../PreferenceComponents';
import type { ISectionProps } from '../useSections';

export function Network(props: ISectionProps): JSX.Element {
  const { t } = useTranslation();

  const preference = usePreferenceObservable();
  const [inputUrls, setInputUrls] = useState(preference?.disableAntiAntiLeechForUrls?.join?.('\n'));
  useEffect(() => {
    if (inputUrls === undefined && preference?.disableAntiAntiLeechForUrls !== undefined) {
      setInputUrls(preference.disableAntiAntiLeechForUrls.join('\n'));
    }
  }, [inputUrls, preference]);

  return (
    <>
      <SectionTitle ref={props.sections.network.ref}>{t('Preference.Network')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {preference === undefined ? <ListItem>{t('Loading')}</ListItem> : (
            <>
              <ListItem>
                <ListItemText primary={t('Preference.DisableAntiAntiLeech')} secondary={t('Preference.DisableAntiAntiLeechDetail')} />
                <ListItemSecondaryAction>
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.disableAntiAntiLeech}
                    onChange={async (event) => {
                      await window.service.preference.set('disableAntiAntiLeech', event.target.checked);
                    }}
                  />
                </ListItemSecondaryAction>
              </ListItem>

              {!preference.disableAntiAntiLeech && (
                <>
                  <Divider />
                  <ListItem>
                    <ListItemText primary={t('Preference.DisableAntiAntiLeechForUrls')} secondary={t('Preference.DisableAntiAntiLeechForUrlsDetail')} />
                  </ListItem>
                  <ListItem>
                    <TextField
                      label={t('Preference.DisableAntiAntiLeechForUrls')}
                      helperText={t('Preference.AntiAntiLeech')}
                      multiline
                      fullWidth
                      minRows={3}
                      value={inputUrls}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                        setInputUrls(event.target.value);
                        const urlList = event.target.value.split('\n').map(url => url.trim()).filter(Boolean);
                        void window.service.preference.set('disableAntiAntiLeechForUrls', urlList);
                      }}
                      variant='outlined'
                    />
                  </ListItem>
                </>
              )}
            </>
          )}
        </List>
      </Paper>
    </>
  );
}
