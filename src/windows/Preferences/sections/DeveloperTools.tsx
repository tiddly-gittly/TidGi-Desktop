import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Divider, List, ListItemButton } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { ListItem, ListItemText } from '@/components/ListItem';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { Paper, SectionTitle } from '../PreferenceComponents';
import type { ISectionProps } from '../useSections';

export function DeveloperTools(props: ISectionProps): React.JSX.Element {
  const { t } = useTranslation();

  const [LOG_FOLDER, SETTINGS_FOLDER, V8_CACHE_FOLDER] = usePromiseValue<[string | undefined, string | undefined, string | undefined]>(
    async () => await Promise.all([window.service.context.get('LOG_FOLDER'), window.service.context.get('SETTINGS_FOLDER'), window.service.context.get('V8_CACHE_FOLDER')]),
    [undefined, undefined, undefined],
  )!;

  return (
    <>
      <SectionTitle ref={props.sections.developers.ref}>{t('Preference.DeveloperTools')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {LOG_FOLDER === undefined || SETTINGS_FOLDER === undefined ? <ListItem>{t('Loading')}</ListItem> : (
            <>
              <ListItemButton
                onClick={() => {
                  if (LOG_FOLDER !== undefined) {
                    void window.service.native.openPath(LOG_FOLDER, true);
                  }
                }}
              >
                <ListItemText primary={t('Preference.OpenLogFolder')} secondary={t('Preference.OpenLogFolderDetail')} />
                <ChevronRightIcon color='action' />
              </ListItemButton>
              <ListItemButton
                onClick={() => {
                  if (SETTINGS_FOLDER !== undefined) {
                    void window.service.native.openPath(SETTINGS_FOLDER, true);
                  }
                }}
              >
                <ListItemText primary={t('Preference.OpenMetaDataFolder')} secondary={t('Preference.OpenMetaDataFolderDetail')} />
                <ChevronRightIcon color='action' />
              </ListItemButton>
              <ListItemButton
                onClick={async () => {
                  if (V8_CACHE_FOLDER !== undefined) {
                    try {
                      await window.service.native.openPath(V8_CACHE_FOLDER, true);
                    } catch (error: unknown) {
                      void window.service.native.log(
                        'error',
                        'DeveloperTools: open V8 cache folder failed',
                        {
                          function: 'DeveloperTools.openV8CacheFolder',
                          error: String(error),
                        },
                      );
                    }
                  }
                }}
              >
                <ListItemText primary={t('Preference.OpenV8CacheFolder')} secondary={t('Preference.OpenV8CacheFolderDetail')} />
                <ChevronRightIcon color='action' />
              </ListItemButton>
              <Divider />
              <ListItemButton
                onClick={async () => {
                  await window.service.preference.resetWithConfirm();
                }}
              >
                <ListItemText primary={t('Preference.RestorePreferences')} />
                <ChevronRightIcon color='action' />
              </ListItemButton>
            </>
          )}
        </List>
      </Paper>
    </>
  );
}
