import PhonelinkIcon from '@mui/icons-material/Phonelink';
import { z } from 'zod';
import type { ISectionDefinition } from './types';

export const tidgiMiniWindowSection: ISectionDefinition = {
  id: 'tidgiMiniWindow',
  titleKey: 'Menu.TidGiMiniWindow',
  Icon: PhonelinkIcon,
  items: [
    {
      type: 'preference-boolean',
      key: 'tidgiMiniWindow',
      titleKey: 'Preference.TidgiMiniWindow',
      descriptionKey: 'Preference.TidgiMiniWindowTip',
      zod: z.boolean(),
    },
    {
      type: 'preference-boolean',
      key: 'tidgiMiniWindowShowTitleBar',
      titleKey: 'Preference.TidgiMiniWindowShowTitleBar',
      descriptionKey: 'Preference.TidgiMiniWindowShowTitleBarDetail',
      zod: z.boolean(),
    },
    {
      type: 'preference-boolean',
      key: 'tidgiMiniWindowAlwaysOnTop',
      titleKey: 'Preference.TidgiMiniWindowAlwaysOnTop',
      descriptionKey: 'Preference.TidgiMiniWindowAlwaysOnTopDetail',
      zod: z.boolean(),
    },
    { type: 'divider' },
    {
      type: 'preference-boolean',
      key: 'tidgiMiniWindowSyncWorkspaceWithMainWindow',
      titleKey: 'Preference.TidgiMiniWindowSyncWorkspaceWithMainWindow',
      descriptionKey: 'Preference.TidgiMiniWindowSyncWorkspaceWithMainWindowDetail',
      zod: z.boolean(),
    },
    {
      type: 'preference-boolean',
      key: 'tidgiMiniWindowShowSidebar',
      titleKey: 'Preference.TidgiMiniWindowShowSidebar',
      descriptionKey: 'Preference.TidgiMiniWindowShowSidebarTip',
      zod: z.boolean(),
    },
    {
      type: 'preference-string',
      key: 'tidgiMiniWindowFixedWorkspaceId',
      titleKey: 'Preference.TidgiMiniWindowFixedWorkspace',
      zod: z.string().optional(),
    },
  ],
};
