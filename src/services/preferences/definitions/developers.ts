import CodeIcon from '@mui/icons-material/Code';
import { z } from 'zod';
import type { ISectionDefinition } from './types';

export const developersSection: ISectionDefinition = {
  id: 'developers',
  titleKey: 'Preference.DeveloperTools',
  Icon: CodeIcon,
  items: [
    {
      type: 'action',
      titleKey: 'Preference.OpenLogFolder',
      descriptionKey: 'Preference.OpenLogFolderDetail',
      handler: 'native.openPath',
      args: ['LOG_FOLDER'],
    },
    { type: 'divider' },
    {
      type: 'action',
      titleKey: 'Preference.OpenMetaDataFolder',
      descriptionKey: 'Preference.OpenMetaDataFolderDetail',
      handler: 'native.openPath',
      args: ['SETTINGS_FOLDER'],
    },
    { type: 'divider' },
    {
      type: 'action',
      titleKey: 'Preference.OpenV8CacheFolder',
      descriptionKey: 'Preference.OpenV8CacheFolderDetail',
      handler: 'native.openPath',
      args: ['V8_CACHE_FOLDER'],
    },
    { type: 'divider' },
    {
      type: 'action',
      titleKey: 'Preference.OpenInstallerLogFolder',
      descriptionKey: 'Preference.OpenInstallerLogFolderDetail',
      handler: 'native.openPath',
      args: ['INSTALLER_LOG_FOLDER'],
      platform: 'win32',
    },
    { type: 'divider' },
    {
      type: 'action',
      titleKey: 'Preference.DiagPanel',
      descriptionKey: 'Preference.DiagPanelDetail',
      handler: 'developerTools.openDiagPanel',
    },
    { type: 'divider' },
    {
      type: 'action',
      titleKey: 'Preference.RestorePreferences',
      handler: 'preference.resetWithConfirm',
    },
    { type: 'divider' },
    {
      type: 'preference-boolean',
      key: 'externalAPIDebug',
      titleKey: 'Preference.ExternalAPIDebug',
      descriptionKey: 'Preference.ExternalAPIDebugDescription',
      ns: 'agent',
      zod: z.boolean(),
    },
    { type: 'divider' },
    {
      type: 'action',
      titleKey: 'Preference.OpenDatabaseFolder',
      ns: 'agent',
      handler: 'developerTools.openExternalApiDbFolder',
    },
    {
      type: 'action',
      titleKey: 'Preference.DeleteExternalApiDatabase',
      handler: 'developerTools.deleteExternalApiDb',
    },
  ],
};
