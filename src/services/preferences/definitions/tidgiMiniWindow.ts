import PhonelinkIcon from '@mui/icons-material/Phonelink';
import type { ISectionDefinition } from './types';

export const tidgiMiniWindowSection: ISectionDefinition = {
  id: 'tidgiMiniWindow',
  titleKey: 'Menu.TidGiMiniWindow',
  Icon: PhonelinkIcon,
  items: [
    {
      type: 'custom',
      componentId: 'tidgiMiniWindow.mainToggle',
      titleKey: 'Preference.TidgiMiniWindow',
      descriptionKey: 'Preference.TidgiMiniWindowTip',
    },
    {
      type: 'custom',
      componentId: 'tidgiMiniWindow.advancedSettings',
      titleKey: 'Preference.TidgiMiniWindow',
      hidden: [{ type: 'preference', key: 'tidgiMiniWindow', operator: 'falsy' }],
    },
  ],
};
