/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/require-await */
import { container } from '@services/container';
import { i18n } from '@services/libs/i18n';
import serviceIdentifier from '@services/serviceIdentifier';
import { IUpdaterService } from '@services/updater/interface';
import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { shell } from 'electron';
import { DeferredMenuItemConstructorOptions } from './interface';

/**
 * Defer to i18next ready to call this
 */
export function loadDefaultMenuTemplate(): DeferredMenuItemConstructorOptions[] {
  const windowService = container.get<IWindowService>(serviceIdentifier.Window);
  const updaterService = container.get<IUpdaterService>(serviceIdentifier.View);

  return [
    {
      label: () => i18n.t('Menu.TidGi'),
      id: 'TidGi',
      submenu: [
        {
          label: () => i18n.t('ContextMenu.About'),
          click: async () => {
            await windowService.open(WindowNames.about);
          },
        },
        { type: 'separator' },
        {
          id: 'update',
          label: () => i18n.t('Updater.CheckUpdate'),
          click: async () => {
            await updaterService.checkForUpdates();
          },
        },
        {
          label: () => i18n.t('ContextMenu.Preferences'),
          accelerator: 'CmdOrCtrl+,',
          click: async () => {
            await windowService.open(WindowNames.preferences);
          },
        },
        { type: 'separator' },
        {
          label: () => i18n.t('Preference.Notifications'),
          click: async () => {
            await windowService.open(WindowNames.notifications);
          },
          accelerator: 'CmdOrCtrl+Shift+N',
        },
        { type: 'separator' },
        { role: 'services', submenu: [] },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { label: () => i18n.t('ContextMenu.Quit') + i18n.t('Menu.TidGi'), role: 'quit' },
      ],
    },
    {
      label: () => i18n.t('Menu.Edit'),
      id: 'Edit',
      role: 'editMenu',
    },
    {
      label: () => i18n.t('Menu.View'),
      id: 'View',
    },
    {
      label: () => i18n.t('Menu.Language'),
      id: 'Language',
    },
    {
      label: () => i18n.t('Menu.History'),
      id: 'History',
    },
    {
      label: () => i18n.t('Menu.Workspaces'),
      id: 'Workspaces',
      submenu: [],
    },
    {
      label: () => i18n.t('Menu.Wiki'),
      id: 'Wiki',
      submenu: [],
    },
    {
      label: () => i18n.t('Menu.Window'),
      role: 'windowMenu',
      id: 'Window',
    },
    {
      label: () => i18n.t('Menu.Help'),
      role: 'help',
      id: 'help',
      submenu: [
        {
          label: () => i18n.t('ContextMenu.TidGiSupport'),
          click: async () => {
            await shell.openExternal('https://github.com/tiddly-gittly/TidGi-desktop/issues');
          },
        },
        {
          label: () => i18n.t('Menu.ReportBugViaGithub'),
          click: async () => {
            await shell.openExternal('https://github.com/tiddly-gittly/TidGi-desktop/issues');
          },
        },
        {
          label: () => i18n.t('Menu.RequestFeatureViaGithub'),
          click: async () => {
            await shell.openExternal('https://github.com/tiddly-gittly/TidGi-desktop/issues/new?template=feature.md&title=feature%3A+');
          },
        },
        {
          label: () => i18n.t('Menu.LearnMore'),
          click: async () => {
            await shell.openExternal('https://github.com/tiddly-gittly/TidGi-desktop/');
          },
        },
      ],
    },
  ] satisfies DeferredMenuItemConstructorOptions[];
}
