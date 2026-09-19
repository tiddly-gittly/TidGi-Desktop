import type { ToolDefinition } from 'memeloop';
import type { z } from 'zod/v4';

/** Pure type-inference helper; activation belongs to a runtime-owned registry. */
export function defineDesktopTool<
  TConfigSchema extends z.ZodType,
  TLLMToolSchemas extends Record<string, z.ZodType> = Record<string, z.ZodType>,
>(definition: ToolDefinition<TConfigSchema, TLLMToolSchemas>): ToolDefinition<TConfigSchema, TLLMToolSchemas> {
  return definition;
}
