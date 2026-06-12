import CodeIcon from '@mui/icons-material/Code';
import { z } from 'zod';
import { mcpServerPortSchema } from './preferenceSchemas';
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
      type: 'custom',
      componentId: 'developers.diagPanel',
      titleKey: 'Preference.DiagPanel',
      descriptionKey: 'Preference.DiagPanelDetail',
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
      key: 'mcpServerEnabled',
      titleKey: 'Preference.McpServerEnabled',
      descriptionKey: 'Preference.McpServerEnabledDescription',
      needsRestart: false,
      zod: z.boolean(),
    },
    {
      type: 'preference-number',
      key: 'mcpServerPort',
      titleKey: 'Preference.McpServerPort',
      needsRestart: false,
      zod: mcpServerPortSchema,
    },
    {
      type: 'preference-boolean',
      key: 'mcpServerRequireToken',
      titleKey: 'Preference.McpServerRequireToken',
      needsRestart: false,
      zod: z.boolean(),
    },
    {
      type: 'preference-string',
      key: 'mcpServerToken',
      titleKey: 'Preference.McpServerToken',
      descriptionKey: 'Preference.McpServerTokenDescription',
      hidden: [{ type: 'preference', key: 'mcpServerRequireToken', operator: 'falsy' }],
      needsRestart: false,
      zod: z.string(),
    },
    {
      type: 'action',
      titleKey: 'Preference.GenerateMcpToken',
      handler: 'native.generateMcpToken',
      hidden: [{ type: 'preference', key: 'mcpServerRequireToken', operator: 'falsy' }],
    },
    {
      type: 'custom',
      componentId: 'developers.mcpVsCodeUrl',
      titleKey: 'Preference.CopyMcpServerUrl',
      hidden: [{ type: 'preference', key: 'mcpServerRequireToken', operator: 'falsy' }],
    },
    { type: 'divider' },
    {
      type: 'custom',
      componentId: 'developers.externalApi',
      titleKey: 'Preference.ExternalAPIDebug',
      descriptionKey: 'Preference.ExternalAPIDebugDescription',
      ns: 'agent',
    },
  ],
};
