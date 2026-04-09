import SearchIcon from '@mui/icons-material/Search';
import type { IGenericSectionDefinition } from '@services/preferences/definitions/types';

export const searchSection: IGenericSectionDefinition = {
  id: 'search',
  titleKey: 'Preference.SearchAndEmbedding',
  Icon: SearchIcon,
  items: [
    {
      type: 'custom',
      componentId: 'workspace.embedding',
      titleKey: 'Preference.SearchEmbeddings',
    },
  ],
};
