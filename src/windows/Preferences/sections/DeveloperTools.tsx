import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Divider, List, ListItemButton, Switch } from '@mui/material';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ListItem, ListItemText } from '@/components/ListItem';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { Paper, SectionTitle } from '../PreferenceComponents';
import type { ISectionProps } from '../useSections';

export function DeveloperTools(props: ISectionProps): React.JSX.Element {
  const { t } = useTranslation();
  const preference = usePreferenceObservable();

  const [LOG_FOLDER, SETTINGS_FOLDER, V8_CACHE_FOLDER] = usePromiseValue<[string | undefined, string | undefined, string | undefined]>(
    async () => await Promise.all([window.service.context.get('LOG_FOLDER'), window.service.context.get('SETTINGS_FOLDER'), window.service.context.get('V8_CACHE_FOLDER')]),
    [undefined, undefined, undefined],
  )!;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [externalApiInfo, setExternalApiInfo] = useState<{ exists: boolean; size?: number; path?: string }>({ exists: false });

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const info = await window.service.database.getDatabaseInfo('externalApi');
        const path = await window.service.database.getDatabasePath('externalApi');
        setExternalApiInfo({ ...info, path });
      } catch (error) {
        void window.service.native.log(
          'error',
          'DeveloperTools: fetch externalApi database info failed',
          {
            function: 'DeveloperTools.fetchInfo',
            error: String(error),
          },
        );
      }
    };
    void fetchInfo();
  }, []);

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
              <Divider />
              <ListItem>
                <ListItemText
                  primary={t('Preference.ExternalAPIDebug', { ns: 'agent' })}
                  secondary={t('Preference.ExternalAPIDebugDescription', { ns: 'agent' })}
                />
                <Switch
                  edge='end'
                  checked={preference?.externalAPIDebug || false}
                  disabled={preference === undefined}
                  onChange={async () => {
                    await window.service.preference.set('externalAPIDebug', !preference?.externalAPIDebug);
                    const info = await window.service.database.getDatabaseInfo('externalApi');
                    if (!info?.exists) {
                      // if database didn't exist before, enabling externalAPIDebug requires application restart to initialize the database table
                      props.requestRestartCountDown?.();
                    }
                  }}
                  name='externalAPIDebug'
                />
              </ListItem>
              {preference?.externalAPIDebug && (
                <>
                  <Divider />
                  <ListItemButton
                    onClick={async () => {
                      if (externalApiInfo.path) {
                        try {
                          await window.service.native.openPath(externalApiInfo.path, true);
                        } catch (error) {
                          void window.service.native.log(
                            'error',
                            'DeveloperTools: open externalApi database folder failed',
                            {
                              function: 'DeveloperTools.openExternalApiDatabaseFolder',
                              error: String(error),
                              path: externalApiInfo.path,
                            },
                          );
                        }
                      }
                    }}
                  >
                    <ListItemText
                      primary={t('Preference.OpenDatabaseFolder', { ns: 'agent' })}
                      secondary={externalApiInfo.path || t('Unknown')}
                    />
                    <ChevronRightIcon color='action' />
                  </ListItemButton>
                  <ListItemButton
                    onClick={() => {
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <ListItemText
                      primary={t('Preference.DeleteExternalApiDatabase')}
                      secondary={t('Preference.ExternalApiDatabaseDescription', {
                        size: externalApiInfo.size ? (externalApiInfo.size / 1024 / 1024).toFixed(2) + ' MB' : t('Unknown'),
                      })}
                    />
                    <ChevronRightIcon color='action' />
                  </ListItemButton>
                </>
              )}
            </>
          )}
        </List>
      </Paper>

      <Dialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
        }}
      >
        <DialogTitle>{t('Preference.ConfirmDelete')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('Preference.ConfirmDeleteExternalApiDatabase')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDeleteDialogOpen(false);
            }}
          >
            {t('Cancel')}
          </Button>
          <Button
            onClick={async () => {
              try {
                await window.service.database.deleteDatabase('externalApi');
                setDeleteDialogOpen(false);
                // Refresh info after deletion
                const info = await window.service.database.getDatabaseInfo('externalApi');
                const path = await window.service.database.getDatabasePath('externalApi');
                setExternalApiInfo({ ...info, path });
              } catch (error) {
                void window.service.native.log(
                  'error',
                  'DeveloperTools: delete externalApi database failed',
                  {
                    function: 'DeveloperTools.handleDelete',
                    error: String(error),
                  },
                );
              }
            }}
            color='error'
          >
            {t('Delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
