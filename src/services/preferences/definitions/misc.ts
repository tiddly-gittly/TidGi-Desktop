import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import { WindowNames } from '@services/windows/WindowProperties';
import type { ISectionDefinition } from './types';

export const miscSection: ISectionDefinition = {
  id: 'misc',
  titleKey: 'Preference.Miscellaneous',
  Icon: MoreHorizIcon,
  items: [
    {
      type: 'action',
      titleKey: 'ContextMenu.About',
      handler: 'window.open',
      args: [WindowNames.about],
    },
    { type: 'divider' },
    {
      type: 'action',
      titleKey: 'Preference.WebSite',
      handler: 'native.openURI',
      args: ['https://github.com/tiddly-gittly/TidGi-desktop/'],
    },
    { type: 'divider' },
    {
      type: 'action',
      titleKey: 'Preference.Support',
      handler: 'native.openURI',
      args: ['https://github.com/tiddly-gittly/TidGi-desktop/issues'],
    },
    { type: 'divider' },
    {
      type: 'action',
      titleKey: 'ContextMenu.Quit',
      handler: 'native.quit',
    },
  ],
};
