import { identity } from 'lodash';
import { z } from 'zod/v4';

const t = identity;

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

export const WikiSearchParameterSchema = z.object({
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
    title: t('Schema.WikiSearch.SourceTypeTitle'),
    description: t('Schema.WikiSearch.SourceType'),
  }),
  toolListPosition: z.object({
    targetId: z.string().meta({
      title: t('Schema.WikiSearch.ToolListPosition.TargetIdTitle'),
      description: t('Schema.WikiSearch.ToolListPosition.TargetId'),
    }),
    position: z.enum(['before', 'after']).meta({
      title: t('Schema.WikiSearch.ToolListPosition.PositionTitle'),
      description: t('Schema.WikiSearch.ToolListPosition.Position'),
    }),
  }).optional().meta({
    title: t('Schema.WikiSearch.ToolListPositionTitle'),
    description: t('Schema.WikiSearch.ToolListPosition'),
  }),
}).meta({
  title: t('Schema.WikiSearch.Title'),
  description: t('Schema.WikiSearch.Description'),
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
  wikiSearchParam: WikiSearchParameterSchema.optional().meta({
    title: t('Schema.Plugin.WikiSearchParamTitle'),
    description: t('Schema.Plugin.WikiSearchParam'),
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
