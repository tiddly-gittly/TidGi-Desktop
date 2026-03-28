import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import { z } from 'zod';
import type { ISectionDefinition } from './types';

export const downloadsSection: ISectionDefinition = {
  id: 'downloads',
  titleKey: 'Preference.Downloads',
  Icon: CloudDownloadIcon,
  items: [
    {
      type: 'action',
      titleKey: 'Preference.DownloadLocation',
      handler: 'native.pickDirectory',
      args: ['downloadPath'],
    },
    { type: 'divider' },
    {
      type: 'preference-boolean',
      key: 'askForDownloadPath',
      titleKey: 'Preference.AskDownloadLocation',
      zod: z.boolean(),
    },
  ],
};
