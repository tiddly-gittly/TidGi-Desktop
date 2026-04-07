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
    { type: 'divider' },
    {
      // Custom items used to make Node Management searchable. Even though AIAgent.tsx is a CustomSectionComponent
      // and renders them manually, declaring them here allows Search to index them.
      type: 'custom',
      titleKey: 'Preference.NodeManagement',
      descriptionKey: 'Preference.NodeManagementDescription',
      componentId: 'aiAgent.nodeManagement',
    },
    {
      type: 'custom',
      titleKey: 'Preference.NodeIdentity',
      descriptionKey: 'Preference.NodeIdentityDescription',
      componentId: 'aiAgent.nodeManagement',
    },
    {
      type: 'custom',
      titleKey: 'Preference.KnownNodes',
      descriptionKey: 'Preference.KnownNodesDescription',
      componentId: 'aiAgent.nodeManagement',
    },
    {
      type: 'custom',
      titleKey: 'Preference.ConnectPeer',
      descriptionKey: 'Preference.ConnectPeerDescription',
      componentId: 'aiAgent.nodeManagement',
    },
    {
      type: 'custom',
      titleKey: 'Preference.SyncStatus',
      descriptionKey: 'Preference.SyncStatusDescription',
      componentId: 'aiAgent.nodeManagement',
    },
    {
      type: 'custom',
      titleKey: 'Preference.RemoteWikis',
      descriptionKey: 'Preference.RemoteWikisDescription',
      componentId: 'aiAgent.nodeManagement',
    },
  ],
};
