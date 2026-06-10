import GitHubIcon from '@mui/icons-material/GitHub';
import { z } from 'zod';
import type { ISectionDefinition } from './types';

export const syncSection: ISectionDefinition = {
  id: 'sync',
  titleKey: 'Preference.Sync',
  Icon: GitHubIcon,
  items: [
    // Git credential / token form (complex OAuth UI rendered by CustomSectionComponent)
    {
      type: 'custom',
      componentId: 'sync.tokenForm',
      titleKey: 'Preference.Token',
      descriptionKey: 'Preference.TokenDescription',
    },
    { type: 'divider' },
    {
      type: 'preference-boolean',
      key: 'syncBeforeShutdown',
      titleKey: 'Preference.SyncBeforeShutdown',
      descriptionKey: 'Preference.SyncBeforeShutdownDescription',
      needsRestart: true,
      zod: z.boolean(),
    },
    { type: 'divider' },
    {
      type: 'preference-boolean',
      key: 'syncOnlyWhenNoDraft',
      titleKey: 'Preference.SyncOnlyWhenNoDraft',
      descriptionKey: 'Preference.SyncOnlyWhenNoDraftDescription',
      zod: z.boolean(),
    },
    { type: 'divider' },
    {
      type: 'custom',
      componentId: 'sync.interval',
      titleKey: 'Preference.SyncInterval',
      descriptionKey: 'Preference.SyncIntervalDescription',
    },
    { type: 'divider' },
    {
      type: 'preference-boolean',
      key: 'aiGenerateBackupTitle',
      titleKey: 'Preference.AIGenerateBackupTitle',
      descriptionKey: 'Preference.AIGenerateBackupTitleDescription',
      zod: z.boolean(),
    },
    { type: 'divider' },
    {
      type: 'custom',
      componentId: 'sync.aiTimeout',
      titleKey: 'Preference.AIGenerateBackupTitleTimeout',
      descriptionKey: 'Preference.AIGenerateBackupTitleTimeoutDescription',
    },
    { type: 'divider' },
    {
      type: 'custom',
      componentId: 'sync.moreSettings',
      titleKey: 'Preference.MoreWorkspaceSyncSettings',
      descriptionKey: 'Preference.MoreWorkspaceSyncSettingsDescription',
    },
  ],
};
