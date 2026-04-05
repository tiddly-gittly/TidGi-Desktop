import DevicesOtherIcon from '@mui/icons-material/DevicesOther';
import type { ISectionDefinition } from './types';

export const wikiSyncSection: ISectionDefinition = {
  id: 'wikiSync',
  titleKey: 'Preference.WikiSync',
  Icon: DevicesOtherIcon,
  // Entirely custom — local/remote wiki lists, sync config, node status
  items: [],
};
