import { KeyboardShortcutRegister } from '@/components/KeyboardShortcutRegister';
import { ListItem, ListItemText } from '@/components/ListItem';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { Box, Divider, FormControl, InputLabel, MenuItem, Select, Switch, Typography } from '@mui/material';
import type { ICustomItemProps } from '@services/preferences/definitions/types';
import { usePreferenceObservable } from '@services/preferences/hooks';
import type { IWindowService } from '@services/windows/interface';
import type { IWorkspace } from '@services/workspaces/interface';
import React from 'react';
import { useTranslation } from 'react-i18next';

export function TidGiMiniWindowMainToggleItem(): React.JSX.Element {
  const { t } = useTranslation();
  const preference = usePreferenceObservable();
  const platform = usePromiseValue(async () => await window.service.context.get('platform'));

  if (preference === undefined || platform === undefined) {
    return <ListItem>{t('Loading')}</ListItem>;
  }

  return (
    <ListItem
      secondaryAction={(
        <Switch
          edge='end'
          color='primary'
          checked={preference.tidgiMiniWindow}
          onChange={async (event) => {
            await window.service.preference.set('tidgiMiniWindow', event.target.checked);
          }}
          data-testid='attach-to-tidgi-mini-window-switch'
        />
      )}
    >
      <ListItemText
        primary={platform === 'win32' ? t('Preference.AttachToTaskbar') : t('Preference.TidgiMiniWindow')}
        secondary={platform === 'linux' ? undefined : t('Preference.TidgiMiniWindowTip')}
      />
    </ListItem>
  );
}

export function TidGiMiniWindowAdvancedSettingsItem(): React.JSX.Element {
  const { t } = useTranslation();
  const preference = usePreferenceObservable();
  const platform = usePromiseValue(async () => await window.service.context.get('platform'));
  const workspaces = usePromiseValue<IWorkspace[]>(async () => await window.service.workspace.getWorkspacesAsList(), []);

  if (preference === undefined || platform === undefined || !preference.tidgiMiniWindow) {
    return <></>;
  }

  return (
    <>
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
      <ListItem
        secondaryAction={(
          <Switch
            edge='end'
            color='primary'
            checked={preference.tidgiMiniWindowShowTitleBar}
            onChange={async (event) => {
              await window.service.preference.set('tidgiMiniWindowShowTitleBar', event.target.checked);
            }}
            data-testid='tidgi-mini-window-titlebar-switch'
          />
        )}
      >
        <ListItemText
          primary={t('Preference.TidgiMiniWindowShowTitleBar')}
          secondary={t('Preference.TidgiMiniWindowShowTitleBarDetail')}
        />
      </ListItem>
      <ListItem
        secondaryAction={(
          <Switch
            edge='end'
            color='primary'
            checked={preference.tidgiMiniWindowAlwaysOnTop}
            onChange={async (event) => {
              await window.service.preference.set('tidgiMiniWindowAlwaysOnTop', event.target.checked);
            }}
            data-testid='tidgi-mini-window-always-on-top-switch'
          />
        )}
      >
        <ListItemText primary={t('Preference.TidgiMiniWindowAlwaysOnTop')} secondary={t('Preference.TidgiMiniWindowAlwaysOnTopDetail')} />
      </ListItem>
      <Divider />
      <ListItem
        secondaryAction={(
          <Switch
            edge='end'
            color='primary'
            checked={preference.tidgiMiniWindowSyncWorkspaceWithMainWindow}
            onChange={async (event) => {
              await window.service.preference.set('tidgiMiniWindowSyncWorkspaceWithMainWindow', event.target.checked);
            }}
            data-testid='tidgi-mini-window-sync-workspace-switch'
          />
        )}
      >
        <ListItemText
          primary={t('Preference.TidgiMiniWindowSyncWorkspaceWithMainWindow')}
          secondary={t('Preference.TidgiMiniWindowSyncWorkspaceWithMainWindowDetail')}
        />
      </ListItem>
      {!preference.tidgiMiniWindowSyncWorkspaceWithMainWindow && (
        <>
          <ListItem
            secondaryAction={(
              <Switch
                edge='end'
                color='primary'
                checked={preference.tidgiMiniWindowShowSidebar}
                onChange={async (event) => {
                  await window.service.preference.set('tidgiMiniWindowShowSidebar', event.target.checked);
                }}
                data-testid='sidebar-on-tidgi-mini-window-switch'
              />
            )}
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
  );
}