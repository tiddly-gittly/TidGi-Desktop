import SecurityIcon from '@mui/icons-material/Security';
import { z } from 'zod';
import type { ISectionDefinition } from './types';

export const privacySection: ISectionDefinition = {
  id: 'privacy',
  titleKey: 'Preference.PrivacyAndSecurity',
  Icon: SecurityIcon,
  items: [
    {
      type: 'preference-boolean',
      key: 'shareWorkspaceBrowsingData',
      titleKey: 'Preference.ShareBrowsingData',
      needsRestart: true,
      zod: z.boolean(),
    },
    { type: 'divider' },
    {
      type: 'preference-boolean',
      key: 'ignoreCertificateErrors',
      titleKey: 'Preference.IgnoreCertificateErrors',
      descriptionKey: 'Preference.IgnoreCertificateErrorsDescription',
      needsRestart: true,
      zod: z.boolean(),
    },
    { type: 'divider' },
    {
      type: 'action',
      titleKey: 'Preference.ClearBrowsingData',
      descriptionKey: 'Preference.ClearBrowsingDataDescription',
      handler: 'workspaceView.clearBrowsingDataWithConfirm',
    },
    { type: 'divider' },
    {
      type: 'action',
      titleKey: 'Preference.PrivacyPolicy',
      handler: 'native.openURI',
      args: ['https://github.com/tiddly-gittly/TidGi-Desktop/blob/master/PrivacyPolicy.md'],
    },
  ],
};
