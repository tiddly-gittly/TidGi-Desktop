import MenuBookIcon from '@mui/icons-material/MenuBook';
import type { ISectionDefinition } from './types';

export const wikiSection: ISectionDefinition = {
  id: 'wiki',
  titleKey: 'Preference.TiddlyWiki',
  Icon: MenuBookIcon,
  items: [
    {
      type: 'custom',
      titleKey: 'Preference.WikiMetaData',
      descriptionKey: 'Preference.WikiMetaDataDescription',
      componentId: 'wiki.userName',
    },
  ],
};
