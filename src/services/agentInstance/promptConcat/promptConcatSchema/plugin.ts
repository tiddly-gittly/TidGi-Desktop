import { identity } from 'lodash';
import { z } from 'zod/v4';

const t = identity;

// Import parameter schemas from a consolidated location
export const WikiParameterSchema = z.object({
  workspaceName: z.string().meta({
    title: t('Schema.Wiki.WorkspaceNameTitle'),
    description: t('Schema.Wiki.WorkspaceName'),
  }),
  filter: z.string().meta({
    title: t('Schema.Wiki.FilterTitle'),
    description: t('Schema.Wiki.Filter'),
  }),
}).meta({
  title: t('Schema.Wiki.Title'),
  description: t('Schema.Wiki.Description'),
});

export const TriggerSchema = z.object({
  search: z.string().optional().meta({
    title: t('Schema.Trigger.SearchTitle'),
    description: t('Schema.Trigger.Search'),
  }),
  randomChance: z.number().min(0).max(1).optional().meta({
    title: t('Schema.Trigger.RandomChanceTitle'),
    description: t('Schema.Trigger.RandomChance'),
  }),
  filter: z.string().optional().meta({
    title: t('Schema.Trigger.FilterTitle'),
    description: t('Schema.Trigger.Filter'),
  }),
  model: z.object({
    preset: z.string().optional().meta({
      title: t('Schema.Trigger.Model.PresetTitle'),
      description: t('Schema.Trigger.Model.Preset'),
    }),
    system: z.string().optional().meta({
      title: t('Schema.Trigger.Model.SystemTitle'),
      description: t('Schema.Trigger.Model.System'),
    }),
    user: z.string().optional().meta({
      title: t('Schema.Trigger.Model.UserTitle'),
      description: t('Schema.Trigger.Model.User'),
    }),
  }).optional().meta({
    title: t('Schema.Trigger.Model.Title'),
    description: t('Schema.Trigger.Model.Description'),
  }),
}).meta({
  title: t('Schema.Trigger.Title'),
  description: t('Schema.Trigger.Description'),
});

export const FullReplacementParameterSchema = z.object({
  targetId: z.string().meta({
    title: t('Schema.FullReplacement.TargetIdTitle'),
    description: t('Schema.FullReplacement.TargetId'),
  }),
  sourceType: z.enum(['historyOfSession', 'llmResponse']).meta({
    title: t('Schema.FullReplacement.SourceTypeTitle'),
    description: t('Schema.FullReplacement.SourceType'),
  }),
}).meta({
  title: t('Schema.FullReplacement.Title'),
  description: t('Schema.FullReplacement.Description'),
});

export const DynamicPositionParameterSchema = z.object({
  targetId: z.string().meta({
    title: t('Schema.Position.TargetIdTitle'),
    description: t('Schema.Position.TargetId'),
  }),
  position: z.enum(['before', 'after', 'relative']).meta({
    title: t('Schema.Position.TypeTitle'),
    description: t('Schema.Position.Type'),
  }),
}).meta({
  title: t('Schema.Position.Title'),
  description: t('Schema.Position.Description'),
});

export const RetrievalAugmentedGenerationParameterSchema = z.object({
  position: z.enum(['relative', 'absolute', 'before', 'after']).meta({
    title: t('Schema.Position.TypeTitle'),
    description: t('Schema.Position.Type'),
  }),
  targetId: z.string().meta({
    title: t('Schema.Position.TargetIdTitle'),
    description: t('Schema.Position.TargetId'),
  }),
  bottom: z.number().optional().meta({
    title: t('Schema.Position.BottomTitle'),
    description: t('Schema.Position.Bottom'),
  }),
  sourceType: z.enum(['wiki']).meta({
    title: t('Schema.RAG.SourceTypeTitle'),
    description: t('Schema.RAG.SourceType'),
  }),
  wikiParam: WikiParameterSchema.optional().meta({
    title: t('Schema.RAG.WikiParamTitle'),
    description: t('Schema.RAG.WikiParam'),
  }),
  toolListPosition: z.object({
    targetId: z.string().meta({
      title: t('Schema.RAG.ToolListPosition.TargetIdTitle'),
      description: t('Schema.RAG.ToolListPosition.TargetId'),
    }),
    position: z.enum(['before', 'after']).meta({
      title: t('Schema.RAG.ToolListPosition.PositionTitle'),
      description: t('Schema.RAG.ToolListPosition.Position'),
    }),
  }).optional().meta({
    title: t('Schema.RAG.ToolListPositionTitle'),
    description: t('Schema.RAG.ToolListPosition'),
  }),
  trigger: TriggerSchema.optional().meta({
    title: t('Schema.RAG.TriggerTitle'),
    description: t('Schema.RAG.Trigger'),
  }),
}).meta({
  title: t('Schema.RAG.Title'),
  description: t('Schema.RAG.Description'),
});

export const ModelContextProtocolParameterSchema = z.object({
  id: z.string().meta({
    title: t('Schema.MCP.IdTitle'),
    description: t('Schema.MCP.Id'),
  }),
  timeoutSecond: z.number().optional().meta({
    title: t('Schema.MCP.TimeoutSecondTitle'),
    description: t('Schema.MCP.TimeoutSecond'),
  }),
  timeoutMessage: z.string().optional().meta({
    title: t('Schema.MCP.TimeoutMessageTitle'),
    description: t('Schema.MCP.TimeoutMessage'),
  }),
  position: z.enum(['before', 'after']).meta({
    title: t('Schema.Position.TypeTitle'),
    description: t('Schema.Position.Type'),
  }),
  targetId: z.string().meta({
    title: t('Schema.Position.TargetIdTitle'),
    description: t('Schema.Position.TargetId'),
  }),
  trigger: TriggerSchema.optional().meta({
    title: t('Schema.MCP.TriggerTitle'),
    description: t('Schema.MCP.Trigger'),
  }),
}).meta({
  title: t('Schema.MCP.Title'),
  description: t('Schema.MCP.Description'),
});

export const ToolCallingParameterSchema = z.object({
  targetId: z.string().meta({
    title: t('Schema.ToolCalling.TargetIdTitle'),
    description: t('Schema.ToolCalling.TargetId'),
  }),
  match: z.string().meta({
    title: t('Schema.ToolCalling.MatchTitle'),
    description: t('Schema.ToolCalling.Match'),
  }),
}).meta({
  title: t('Schema.ToolCalling.Title'),
  description: t('Schema.ToolCalling.Description'),
});

export const AutoReplyParameterSchema = z.object({
  targetId: z.string().meta({
    title: t('Schema.AutoReply.TargetIdTitle'),
    description: t('Schema.AutoReply.TargetId'),
  }),
  text: z.string().meta({
    title: t('Schema.AutoReply.TextTitle'),
    description: t('Schema.AutoReply.Text'),
  }),
  trigger: TriggerSchema.optional().meta({
    title: t('Schema.AutoReply.TriggerTitle'),
    description: t('Schema.AutoReply.Trigger'),
  }),
  maxAutoReply: z.number().optional().meta({
    title: t('Schema.AutoReply.MaxAutoReplyTitle'),
    description: t('Schema.AutoReply.MaxAutoReply'),
  }),
}).meta({
  title: t('Schema.AutoReply.Title'),
  description: t('Schema.AutoReply.Description'),
});

export const PluginSchema = z.object({
  id: z.string().meta({
    title: t('Schema.Plugin.IdTitle'),
    description: t('Schema.Plugin.Id'),
  }),
  caption: z.string().optional().meta({
    title: t('Schema.Plugin.CaptionTitle'),
    description: t('Schema.Plugin.Caption'),
  }),
  content: z.string().optional().meta({
    title: t('Schema.Plugin.ContentTitle'),
    description: t('Schema.Plugin.Content'),
  }),
  forbidOverrides: z.boolean().optional().default(false).meta({
    title: t('Schema.Plugin.ForbidOverridesTitle'),
    description: t('Schema.Plugin.ForbidOverrides'),
  }),
  pluginId: z.enum([
    'fullReplacement',
    'dynamicPosition',
    'retrievalAugmentedGeneration',
    'wikiSearch',
    'modelContextProtocol',
    'toolCalling',
    'autoReply',
  ]).meta({
    title: t('Schema.Plugin.PluginIdTitle'),
    description: t('Schema.Plugin.PluginId'),
    enumOptions: [
      { value: 'fullReplacement', label: t('Schema.Plugin.FullReplacementParamTitle') },
      { value: 'dynamicPosition', label: t('Schema.Plugin.DynamicPositionParamTitle') },
      { value: 'retrievalAugmentedGeneration', label: t('Schema.Plugin.RAGParamTitle') },
      { value: 'modelContextProtocol', label: t('Schema.Plugin.MCPParamTitle') },
      { value: 'toolCalling', label: t('Schema.Plugin.ToolCallingParamTitle') },
      { value: 'autoReply', label: t('Schema.Plugin.AutoReplyParamTitle') },
    ],
  }),
  // 参数配置
  fullReplacementParam: FullReplacementParameterSchema.optional().meta({
    title: t('Schema.Plugin.FullReplacementParamTitle'),
    description: t('Schema.Plugin.FullReplacementParam'),
  }),
  dynamicPositionParam: DynamicPositionParameterSchema.optional().meta({
    title: t('Schema.Plugin.DynamicPositionParamTitle'),
    description: t('Schema.Plugin.DynamicPositionParam'),
  }),
  retrievalAugmentedGenerationParam: RetrievalAugmentedGenerationParameterSchema.optional().meta({
    title: t('Schema.Plugin.RAGParamTitle'),
    description: t('Schema.Plugin.RAGParam'),
  }),
  modelContextProtocolParam: ModelContextProtocolParameterSchema.optional().meta({
    title: t('Schema.Plugin.MCPParamTitle'),
    description: t('Schema.Plugin.MCPParam'),
  }),
  toolCallingParam: ToolCallingParameterSchema.optional().meta({
    title: t('Schema.Plugin.ToolCallingParamTitle'),
    description: t('Schema.Plugin.ToolCallingParam'),
  }),
  autoReplyParam: AutoReplyParameterSchema.optional().meta({
    title: t('Schema.Plugin.AutoReplyParamTitle'),
    description: t('Schema.Plugin.AutoReplyParam'),
  }),
});

export type Plugin = z.infer<typeof PluginSchema>;
