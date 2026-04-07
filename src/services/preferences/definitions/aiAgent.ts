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
      type: 'action',
      titleKey: 'Preference.NodeIdentity',
      descriptionKey: 'Preference.NodeIdentityDescription',
      ns: 'translation',
      handler: 'memeloopNode.showIdentity',
    },
    {
      type: 'action',
      titleKey: 'Preference.KnownNodes',
      descriptionKey: 'Preference.KnownNodesDescription',
      ns: 'translation',
      handler: 'memeloopNode.showKnownNodes',
    },
    {
      type: 'action-input',
      titleKey: 'Preference.ConnectPeer',
      descriptionKey: 'Preference.ConnectPeerDescription',
      ns: 'translation',
      handler: 'memeloopNode.addPeer',
      buttonTextKey: 'Preference.WikiSync.Connect',
      placeholderKey: 'ws://192.168.1.100:9000',
    },
    {
      type: 'action',
      titleKey: 'Preference.SyncNowButton',
      descriptionKey: 'Preference.SyncStatusDescription',
      ns: 'translation',
      handler: 'memeloopNode.syncNow',
    },
    {
      type: 'action',
      titleKey: 'Preference.RemoteWikis',
      descriptionKey: 'Preference.RemoteWikisDescription',
      ns: 'translation',
      handler: 'memeloopNode.showRemoteWikis',
    },
  ],
};
