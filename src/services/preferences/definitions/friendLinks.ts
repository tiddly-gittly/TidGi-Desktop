import StorefrontIcon from '@mui/icons-material/Storefront';
import type { ISectionDefinition } from './types';

export const friendLinksSection: ISectionDefinition = {
  id: 'friendLinks',
  titleKey: 'Preference.FriendLinks',
  Icon: StorefrontIcon,
  items: [
    {
      type: 'action',
      titleKey: 'Preference.WebCatalogEngineIntro',
      handler: 'native.openURI',
      args: ['https://github.com/webcatalog/webcatalog-engine'],
    },
    { type: 'divider' },
    {
      type: 'action',
      titleKey: 'Preference.WebCatalog',
      descriptionKey: 'Preference.WebCatalogIntro',
      handler: 'native.openURI',
      args: ['https://webcatalogapp.com?utm_source=tidgi_app'],
    },
    { type: 'divider' },
    {
      type: 'action',
      titleKey: 'Preference.Translatium',
      descriptionKey: 'Preference.TranslatiumIntro',
      handler: 'native.openURI',
      args: ['https://translatiumapp.com?utm_source=tidgi_app'],
    },
  ],
};
