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

export function TidGiMiniWindow(props: Partial<ISectionProps>): React.JSX.Element {
  const { t } = useTranslation();
  const preference = usePreferenceObservable();
  const platform = usePromiseValue(async () => await window.service.context.get('platform'));
  const workspaces = usePromiseValue(async () => (await window.service.workspace.getWorkspacesAsList()), []);

  if (preference === undefined || platform === undefined) {
    return <ListItem>{t('Loading')}</ListItem>;
  }

  return (
    <>
      <SectionTitle ref={props.sections?.tidgiMiniWindow.ref}>{t('Menu.TidGiMiniWindow')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {/* Attach to taskbar/system tray settings */}
          <ListItem
            secondaryAction={
              <Switch
                edge='end'
                color='primary'
                checked={preference.tidgiMiniWindow}
                onChange={async (event) => {
                  await window.service.preference.set('tidgiMiniWindow', event.target.checked);
                }}
                data-testid='attach-to-tidgi-mini-window-switch'
              />
            }
          >
            <ListItemText
              primary={platform === 'win32' ? t('Preference.AttachToTaskbar') : t('Preference.TidgiMiniWindow')}
              secondary={platform === 'linux' ? undefined : t('Preference.TidgiMiniWindowTip')}
            />
          </ListItem>

          {/* Other settings are only visible when attached to taskbar/system tray */}
          {preference.tidgiMiniWindow && (
            <>
              {/* Set shortcut key to toggle TidGi mini window */}
              <Box sx={{ p: 2 }}>
                <KeyboardShortcutRegister
                  label={t('Preference.TidgiMiniWindowShortcutKey')}
                  value={preference.keyboardShortcuts?.['Window.toggleTidgiMiniWindow'] || ''}
                  onChange={async (value) => {
                    if (value && value.trim() !== '') {
                      await window.service.native.registerKeyboardShortcut<IWindowService>('Window', 'toggleTidgiMiniWindow', value);
                    } else {
                      await window.service.native.unregisterKeyboardShortcut<IWindowService>('Window', 'toggleTidgiMiniWindow');
                    }
                  }}
                  data-testid='tidgi-mini-window-shortcut-input'
                />
                <Box sx={{ mt: 1 }}>
                  <Typography variant='caption' color='textSecondary'>
                    {t('Preference.TidgiMiniWindowShortcutKeyHelperText')}
                  </Typography>
                </Box>
              </Box>
              {/* Show title bar on tidgi mini window */}
              <ListItem
                secondaryAction={
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.tidgiMiniWindowShowTitleBar}
                    onChange={async (event) => {
                      await window.service.preference.set('tidgiMiniWindowShowTitleBar', event.target.checked);
                    }}
                    data-testid='tidgi-mini-window-titlebar-switch'
                  />
                }
              >
                <ListItemText
                  primary={t('Preference.TidgiMiniWindowShowTitleBar')}
                  secondary={t('Preference.TidgiMiniWindowShowTitleBarDetail')}
                />
              </ListItem>

              {/* Keep tidgi mini window on top of other windows */}
              <ListItem
                secondaryAction={
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.tidgiMiniWindowAlwaysOnTop}
                    onChange={async (event) => {
                      await window.service.preference.set('tidgiMiniWindowAlwaysOnTop', event.target.checked);
                    }}
                    data-testid='tidgi-mini-window-always-on-top-switch'
                  />
                }
              >
                <ListItemText primary={t('Preference.TidgiMiniWindowAlwaysOnTop')} secondary={t('Preference.TidgiMiniWindowAlwaysOnTopDetail')} />
              </ListItem>

              <Divider />

              {/* Show the same workspace in both small and main window */}
              <ListItem
                secondaryAction={
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.tidgiMiniWindowSyncWorkspaceWithMainWindow}
                    onChange={async (event) => {
                      await window.service.preference.set('tidgiMiniWindowSyncWorkspaceWithMainWindow', event.target.checked);
                    }}
                    data-testid='tidgi-mini-window-sync-workspace-switch'
                  />
                }
              >
                <ListItemText
                  primary={t('Preference.TidgiMiniWindowSyncWorkspaceWithMainWindow')}
                  secondary={t('Preference.TidgiMiniWindowSyncWorkspaceWithMainWindowDetail')}
                />
              </ListItem>

              {/* Select fixed workspace for TidGi mini window */}
              {!preference.tidgiMiniWindowSyncWorkspaceWithMainWindow && (
                <>
                  {/* Sidebar display settings */}
                  <ListItem
                    secondaryAction={
                      <Switch
                        edge='end'
                        color='primary'
                        checked={preference.tidgiMiniWindowShowSidebar}
                        onChange={async (event) => {
                          await window.service.preference.set('tidgiMiniWindowShowSidebar', event.target.checked);
                        }}
                        data-testid='sidebar-on-tidgi-mini-window-switch'
                      />
                    }
                  >
                    <ListItemText
                      primary={platform === 'win32' ? t('Preference.AttachToTaskbarShowSidebar') : t('Preference.TidgiMiniWindowShowSidebar')}
                      secondary={platform === 'linux' ? undefined : t('Preference.TidgiMiniWindowShowSidebarTip')}
                    />
                  </ListItem>

                  <Box sx={{ p: 2 }}>
                    <FormControl fullWidth variant='outlined' sx={{ mt: 1 }}>
                      <InputLabel>{t('Preference.TidgiMiniWindowFixedWorkspace')}</InputLabel>
                      <Select
                        value={preference.tidgiMiniWindowFixedWorkspaceId || ''}
                        onChange={async (event) => {
                          await window.service.preference.set('tidgiMiniWindowFixedWorkspaceId', event.target.value);
                        }}
                        label={t('Preference.TidgiMiniWindowFixedWorkspace')}
                        inputProps={{ 'data-testid': 'tidgi-mini-window-fixed-workspace-select' }}
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
                </>
              )}
            </>
          )}
        </List>
      </Paper>
    </>
  );
}
