import { KeyboardShortcutRegister } from '@/components/KeyboardShortcutRegister';
import { ListItem } from '@/components/ListItem';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { Box, Divider, FormControl, InputLabel, List, ListItemText, MenuItem, Select, Switch, Typography } from '@mui/material';
import { usePreferenceObservable } from '@services/preferences/hooks';
import type { IWindowService } from '@services/windows/interface';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Paper, SectionTitle } from '../PreferenceComponents';
import type { ISectionProps } from '../useSections';

export function TidGiMenubarWindow(props: Partial<ISectionProps>): React.JSX.Element {
  const { t } = useTranslation();
  const preference = usePreferenceObservable();
  const platform = usePromiseValue(async () => await window.service.context.get('platform'));
  const workspaces = usePromiseValue(async () => await window.service.workspace.getWorkspacesAsList(), []);

  if (preference === undefined || platform === undefined) {
    return <ListItem>{t('Loading')}</ListItem>;
  }

  return (
    <>
      <SectionTitle ref={props.sections?.menubar.ref}>{t('Menu.TidGiMenuBar')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {/* Attach to taskbar/menubar settings */}
          <ListItem
            secondaryAction={
              <Switch
                edge='end'
                color='primary'
                checked={preference.attachToMenubar}
                onChange={async (event) => {
                  await window.service.preference.set('attachToMenubar', event.target.checked);
                  props.requestRestartCountDown?.();
                }}
              />
            }
          >
            <ListItemText
              primary={platform === 'win32' ? t('Preference.AttachToTaskbar') : t('Preference.AttachToMenuBar')}
              secondary={platform === 'linux' ? undefined : t('Preference.AttachToMenuBarTip')}
            />
          </ListItem>

          {/* Other settings are only visible when attached to taskbar/menubar */}
          {preference.attachToMenubar && (
            <>
              {/* Sidebar display settings */}
              <ListItem
                secondaryAction={
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.sidebarOnMenubar}
                    onChange={async (event) => {
                      await window.service.preference.set('sidebarOnMenubar', event.target.checked);
                    }}
                  />
                }
              >
                <ListItemText
                  primary={platform === 'win32' ? t('Preference.AttachToTaskbarShowSidebar') : t('Preference.AttachToMenuBarShowSidebar')}
                  secondary={platform === 'linux' ? undefined : t('Preference.AttachToMenuBarShowSidebarTip')}
                />
              </ListItem>

              {/* Keep menubar window on top of other windows */}
              <ListItem
                secondaryAction={
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.menuBarAlwaysOnTop}
                    onChange={async (event) => {
                      await window.service.preference.set('menuBarAlwaysOnTop', event.target.checked);
                      props.requestRestartCountDown?.();
                    }}
                  />
                }
              >
                <ListItemText primary={t('Preference.MenubarAlwaysOnTop')} secondary={t('Preference.MenubarAlwaysOnTopDetail')} />
              </ListItem>

              <Divider />

              {/* Show the same workspace in both small and main window */}
              <ListItem
                secondaryAction={
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.menubarSyncWorkspaceWithMainWindow}
                    onChange={async (event) => {
                      await window.service.preference.set('menubarSyncWorkspaceWithMainWindow', event.target.checked);
                    }}
                  />
                }
              >
                <ListItemText
                  primary={t('Preference.MenubarSyncWorkspaceWithMainWindow')}
                  secondary={t('Preference.MenubarSyncWorkspaceWithMainWindowDetail')}
                />
              </ListItem>

              {/* Select fixed workspace for TidGi menubar window */}
              {!preference.menubarSyncWorkspaceWithMainWindow && (
                <Box sx={{ p: 2 }}>
                  <FormControl fullWidth variant='outlined' sx={{ mt: 1 }}>
                    <InputLabel>{t('Preference.MenubarFixedWorkspace')}</InputLabel>
                    <Select
                      value={preference.menubarFixedWorkspaceId || ''}
                      onChange={async (event) => {
                        await window.service.preference.set('menubarFixedWorkspaceId', event.target.value);
                      }}
                      label={t('Preference.MenubarFixedWorkspace')}
                    >
                      <MenuItem value=''>{t('Preference.SelectWorkspace')}</MenuItem>
                      {workspaces?.map((workspace) => (
                        <MenuItem key={workspace.id} value={workspace.id}>
                          {workspace.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              )}

              {/* Set shortcut key to toggle TidGi menubar window */}
              <Box sx={{ p: 2 }}>
                <KeyboardShortcutRegister
                  label={t('Preference.MenubarShortcutKey')}
                  value={preference.keyboardShortcuts?.['NativeService.toggleMenubarWindow'] || ''}
                  onChange={async (value) => {
                    if (value && value.trim() !== '') {
                      await window.service.native.registerKeyboardShortcut<IWindowService>('NativeService', 'toggleMenubarWindow', value);
                    } else {
                      await window.service.native.unregisterKeyboardShortcut<IWindowService>('NativeService', 'toggleMenubarWindow');
                    }
                  }}
                />
                <Box sx={{ mt: 1 }}>
                  <Typography variant='caption' color='textSecondary'>
                    {t('Preference.MenubarShortcutKeyHelperText')}
                  </Typography>
                </Box>
              </Box>
            </>
          )}
        </List>
      </Paper>
    </>
  );
}
