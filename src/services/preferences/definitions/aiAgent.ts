import StorageIcon from '@mui/icons-material/Storage';
import { z } from 'zod';
import type { ISectionDefinition } from './types';

const agentMessageFormatSchema = z.enum(['wikitext', 'markdown']);

export const agentMessageFormatItem = {
  type: 'preference-enum',
  key: 'agentMessageFormat',
  titleKey: 'Preference.AgentMessageFormat',
  descriptionKey: 'Preference.AgentMessageFormatDescription',
  ns: 'agent',
  enumValues: agentMessageFormatSchema.options,
  enumNames: ['Preference.FormatWikiText', 'Preference.FormatMarkdown'],
  zod: agentMessageFormatSchema,
} satisfies ISectionDefinition['items'][number];

export const aiAgentSection: ISectionDefinition = {
  id: 'aiAgent',
  titleKey: 'Preference.AIAgent',
  ns: 'agent',
  Icon: StorageIcon,
  items: [
    agentMessageFormatItem,
    {
      type: 'action',
      titleKey: 'Preference.AIAgentManage',
      descriptionKey: 'Preference.AIAgentManageDescription',
      ns: 'agent',
      handler: 'aiAgent.manage',
    },
    { type: 'divider' },
    // Informational/complex items rendered by CustomSectionComponent; listed here for searchability
    {
      type: 'custom',
      componentId: 'aiAgent.description',
      titleKey: 'Preference.AIAgentDescription',
      descriptionKey: 'Preference.AIAgentDescriptionDetail',
      ns: 'agent',
    },
    {
      type: 'custom',
      componentId: 'aiAgent.openDatabase',
      titleKey: 'Preference.OpenDatabaseFolder',
      ns: 'agent',
    },
    {
      type: 'custom',
      componentId: 'aiAgent.deleteDatabase',
      titleKey: 'Preference.DeleteAgentDatabase',
      descriptionKey: 'Preference.AgentDatabaseDescription',
      ns: 'agent',
    },
  ],
};
