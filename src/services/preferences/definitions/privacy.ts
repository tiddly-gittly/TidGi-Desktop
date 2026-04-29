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
      key: 'analyticsEnabled',
      titleKey: 'Preference.AnalyticsEnabled',
      descriptionKey: 'Preference.AnalyticsEnabledDescription',
      needsRestart: false,
      zod: z.boolean(),
    },
    {
      type: 'preference-text',
      key: 'analyticsHost',
      titleKey: 'Preference.AnalyticsHost',
      descriptionKey: 'Preference.AnalyticsHostDescription',
      needsRestart: false,
      zod: z.string(),
    },
    {
      type: 'preference-text',
      key: 'analyticsSiteId',
      titleKey: 'Preference.AnalyticsSiteId',
      descriptionKey: 'Preference.AnalyticsSiteIdDescription',
      needsRestart: false,
      zod: z.string(),
    },
    {
      type: 'preference-text',
      key: 'analyticsApiKey',
      titleKey: 'Preference.AnalyticsApiKey',
      descriptionKey: 'Preference.AnalyticsApiKeyDescription',
      needsRestart: false,
      zod: z.string(),
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
