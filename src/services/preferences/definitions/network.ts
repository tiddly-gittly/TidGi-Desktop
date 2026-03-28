import RouterIcon from '@mui/icons-material/Router';
import { z } from 'zod';
import type { ISectionDefinition } from './types';

export const networkSection: ISectionDefinition = {
  id: 'network',
  titleKey: 'Preference.Network',
  Icon: RouterIcon,
  items: [
    {
      type: 'preference-boolean',
      key: 'disableAntiAntiLeech',
      titleKey: 'Preference.DisableAntiAntiLeech',
      descriptionKey: 'Preference.DisableAntiAntiLeechDetail',
      zod: z.boolean(),
    },
    { type: 'divider' },
    {
      type: 'preference-string-array',
      key: 'disableAntiAntiLeechForUrls',
      titleKey: 'Preference.DisableAntiAntiLeechForUrls',
      descriptionKey: 'Preference.DisableAntiAntiLeechForUrlsDetail',
      zod: z.array(z.string()),
    },
  ],
};
