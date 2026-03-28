import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';
import { z } from 'zod';
import type { ISectionDefinition } from './types';

export const updatesSection: ISectionDefinition = {
  id: 'updates',
  titleKey: 'Preference.Updates',
  Icon: SystemUpdateAltIcon,
  items: [
    {
      type: 'action',
      titleKey: 'Preference.CheckForUpdates',
      handler: 'updater.checkForUpdates',
    },
    { type: 'divider' },
    {
      type: 'preference-boolean',
      key: 'allowPrerelease',
      titleKey: 'Preference.ReceivePreReleaseUpdates',
      zod: z.boolean(),
    },
  ],
};
