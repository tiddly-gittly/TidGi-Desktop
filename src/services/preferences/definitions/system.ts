import BuildIcon from '@mui/icons-material/Build';
import type { ISectionDefinition } from './types';

export const systemSection: ISectionDefinition = {
  id: 'system',
  titleKey: 'Preference.System',
  Icon: BuildIcon,
  items: [
    {
      type: 'custom',
      titleKey: 'Preference.OpenAtLogin',
      componentId: 'system.openAtLogin',
    },
  ],
};
