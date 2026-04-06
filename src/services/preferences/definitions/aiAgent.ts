import StorageIcon from '@mui/icons-material/Storage';
import { z } from 'zod';
import type { ISectionDefinition } from './types';

export const aiAgentSection: ISectionDefinition = {
  id: 'aiAgent',
  titleKey: 'Preference.AIAgent',
  ns: 'agent',
  Icon: StorageIcon,
  items: [
    {
      type: 'action',
      titleKey: 'Preference.AIAgentManage',
      descriptionKey: 'Preference.AIAgentManageDescription',
      ns: 'agent',
      handler: 'aiAgent.manage',
    },
    { type: 'divider' },
    {
      type: 'preference-number',
      key: 'memeloopNodePort',
      titleKey: 'Preference.MemeloopNodePort',
      descriptionKey: 'Preference.MemeloopNodePortDescription',
      ns: 'agent',
      needsRestart: true,
      zod: z.number().int().min(1024).max(65535),
    },
  ],
};
