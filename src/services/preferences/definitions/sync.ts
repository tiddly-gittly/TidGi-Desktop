import GitHubIcon from '@mui/icons-material/GitHub';
import { z } from 'zod';
import type { ISectionDefinition } from './types';

export const syncSection: ISectionDefinition = {
  id: 'sync',
  titleKey: 'Preference.Sync',
  Icon: GitHubIcon,
  items: [
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
      type: 'preference-number',
      key: 'syncDebounceInterval',
      titleKey: 'Preference.SyncInterval',
      descriptionKey: 'Preference.SyncIntervalDescription',
      needsRestart: true,
      zod: z.number(),
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
      type: 'preference-number',
      key: 'aiGenerateBackupTitleTimeout',
      titleKey: 'Preference.AIGenerateBackupTitleTimeout',
      descriptionKey: 'Preference.AIGenerateBackupTitleTimeoutDescription',
      zod: z.number(),
    },
  ],
};
