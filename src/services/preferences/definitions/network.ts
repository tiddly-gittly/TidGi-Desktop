import RouterIcon from '@mui/icons-material/Router';
import { z } from 'zod';
import { networkProxiesSchema } from './preferenceSchemas';
import type { ISectionDefinition } from './types';

export const networkSection: ISectionDefinition = {
  id: 'network',
  titleKey: 'Preference.Network',
  Icon: RouterIcon,
  items: [
    {
      type: 'preference-key-value-tabs',
      key: 'networkProxies',
      titleKey: 'Preference.ProxyServers',
      descriptionKey: 'Preference.ProxyServersDetail',
      needsRestart: true,
      zod: networkProxiesSchema,
      tabs: [
        {
          key: 'default',
          titleKey: 'Preference.ProxyDefault',
          descriptionKey: 'Preference.ProxyDefaultDetail',
          fields: [
            {
              key: 'url',
              type: 'string',
              titleKey: 'Preference.ProxyServerUrl',
              descriptionKey: 'Preference.ProxyServerUrlDetail',
            },
          ],
        },
        {
          key: 'wikiBackend',
          titleKey: 'Preference.ProxyWikiBackend',
          descriptionKey: 'Preference.ProxyWikiBackendDetail',
          fields: [
            { key: 'useDefault', type: 'boolean', titleKey: 'Preference.ProxyUseDefault' },
            {
              key: 'url',
              type: 'string',
              titleKey: 'Preference.ProxyServerUrl',
              descriptionKey: 'Preference.ProxyServerUrlDetail',
              hiddenWhenField: { key: 'useDefault', equals: true },
            },
          ],
        },
        {
          key: 'wikiFrontend',
          titleKey: 'Preference.ProxyWikiFrontend',
          descriptionKey: 'Preference.ProxyWikiFrontendDetail',
          fields: [
            { key: 'useDefault', type: 'boolean', titleKey: 'Preference.ProxyUseDefault' },
            {
              key: 'url',
              type: 'string',
              titleKey: 'Preference.ProxyServerUrl',
              descriptionKey: 'Preference.ProxyServerUrlDetail',
              hiddenWhenField: { key: 'useDefault', equals: true },
            },
          ],
        },
        {
          key: 'git',
          titleKey: 'Preference.ProxyGit',
          descriptionKey: 'Preference.ProxyGitDetail',
          fields: [
            { key: 'useDefault', type: 'boolean', titleKey: 'Preference.ProxyUseDefault' },
            {
              key: 'url',
              type: 'string',
              titleKey: 'Preference.ProxyServerUrl',
              descriptionKey: 'Preference.ProxyServerUrlDetail',
              hiddenWhenField: { key: 'useDefault', equals: true },
            },
          ],
        },
      ],
    },
    { type: 'divider' },
    {
      type: 'custom',
      titleKey: 'Preference.DeviceNetwork',
      descriptionKey: 'Preference.DeviceNetworkDescription',
      componentId: 'network.deviceNetworkPanel',
    },
    { type: 'divider' },
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
