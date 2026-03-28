import SearchIcon from '@mui/icons-material/Search';
import type { ISectionDefinition } from './types';

export const searchSection: ISectionDefinition = {
  id: 'search',
  titleKey: 'Preference.Search',
  Icon: SearchIcon,
  items: [
    {
      type: 'action',
      titleKey: 'Preference.SearchEmbeddings',
      descriptionKey: 'Preference.SearchEmbeddingsDescription',
      handler: 'search.manageEmbeddings',
    },
  ],
};
