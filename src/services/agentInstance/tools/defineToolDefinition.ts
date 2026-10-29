import type { ToolDefinition } from 'memeloop';
import type { z } from 'zod/v4';
import { localizeToolSchema } from './localizeToolSchema';

/** Keep validation schemas intact; localize only the tool descriptions projected into each request. */
export function defineDesktopTool<
  TConfigSchema extends z.ZodType,
  TLLMToolSchemas extends Record<string, z.ZodType> = Record<string, z.ZodType>,
>(definition: ToolDefinition<TConfigSchema, TLLMToolSchemas>): ToolDefinition<TConfigSchema, TLLMToolSchemas> {
  const { onProcessPrompts } = definition;
  if (!onProcessPrompts) return definition;
  return {
    ...definition,
    onProcessPrompts: context =>
      onProcessPrompts({
        ...context,
        injectToolList: options => {
          const schemas = options.toolSchemas ?? Object.values(definition.llmToolSchemas ?? {});
          context.injectToolList({ ...options, toolSchemas: schemas.map(localizeToolSchema) });
        },
      }),
  };
}
