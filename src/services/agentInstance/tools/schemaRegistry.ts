/**
 * Tool Schema Registry
 *
 * This system allows tools to register their parameter schemas dynamically,
 * enabling dynamic tool loading while maintaining type safety and validation.
 */
import { identity } from 'lodash';
import { z } from 'zod/v4';

const t = identity;

/**
 * Registry for tool parameter schemas
 */
const toolSchemas = new Map<string, z.ZodType>();

/**
 * Registry for tool metadata
 */
const toolMetadata = new Map<string, {
  displayName: string;
  description: string;
}>();

/**
 * Register a tool parameter schema
 * @param toolId The tool ID (should match pluginId enum values)
 * @param schema The Zod schema for this tool's parameters
 * @param metadata Optional metadata for display purposes
 */
export function registerToolParameterSchema(
  toolId: string,
  schema: z.ZodType,
  metadata?: {
    displayName: string;
    description: string;
  },
): void {
  toolSchemas.set(toolId, schema);
  if (metadata) {
    toolMetadata.set(toolId, metadata);
  }
}

/**
 * Get a tool parameter schema by ID
 * @param toolId The tool ID
 * @returns The schema or undefined if not found
 */
export function getToolParameterSchema(toolId: string): z.ZodType | undefined {
  return toolSchemas.get(toolId);
}

/**
 * Get all registered tool IDs
 * @returns Array of all registered tool IDs
 */
export function getAllRegisteredToolIds(): string[] {
  return Array.from(toolSchemas.keys());
}

/**
 * Get tool metadata
 * @param toolId The tool ID
 * @returns Tool metadata or undefined if not found
 */
export function getToolMetadata(toolId: string): { displayName: string; description: string } | undefined {
  return toolMetadata.get(toolId);
}

/**
 * Dynamically create the PromptConcatToolSchema based on registered tools
 * This is called whenever the schema is needed, ensuring it includes all registered tools
 */
export function createDynamicPromptConcatToolSchema(): z.ZodType {
  // Base tool configuration without parameter-specific fields
  const baseToolSchema = z.object({
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
  });

  // Get all registered tool IDs
  const registeredToolIds = getAllRegisteredToolIds();

  if (registeredToolIds.length === 0) {
    // Fallback to a basic schema if no tools are registered yet
    return baseToolSchema.extend({
      pluginId: z.string().meta({
        title: t('Schema.Plugin.PluginIdTitle'),
        description: t('Schema.Plugin.PluginId'),
      }),
    });
  }

  // Create enum from registered tool IDs
  const pluginIdEnum = z.enum(registeredToolIds as [string, ...string[]]).meta({
    title: t('Schema.Plugin.PluginIdTitle'),
    description: t('Schema.Plugin.PluginId'),
    enumOptions: registeredToolIds.map(toolId => {
      const metadata = getToolMetadata(toolId);
      return {
        value: toolId,
        label: metadata?.displayName || toolId,
      };
    }),
  });

  // Create parameter schema object with all registered tools
  const parameterSchema: Record<string, z.ZodType> = {};

  for (const toolId of registeredToolIds) {
    const schema = getToolParameterSchema(toolId);
    if (schema) {
      const metadata = getToolMetadata(toolId);
      parameterSchema[`${toolId}Param`] = schema.optional().meta({
        title: metadata?.displayName || toolId,
        description: metadata?.description || `Parameters for ${toolId} tool`,
      });
    }
  }

  // Combine base schema with tool ID and parameters
  return baseToolSchema.extend({
    pluginId: pluginIdEnum,
    ...parameterSchema,
  });
}

/**
 * Get the type of a tool's parameters
 * @param toolId The tool ID
 * @returns The inferred TypeScript type of the tool's parameters
 */
export type ToolParameterType<T extends string> = T extends keyof ReturnType<typeof createToolParameterTypes> ? ReturnType<typeof createToolParameterTypes>[T] : never;

/**
 * Create type definitions for all registered tool parameters
 * This is used internally for type inference
 */
export function createToolParameterTypes() {
  const types: Record<string, unknown> = {};

  for (const toolId of getAllRegisteredToolIds()) {
    const schema = getToolParameterSchema(toolId);
    if (schema) {
      types[toolId] = schema;
    }
  }

  return types as Record<string, z.ZodType>;
}
