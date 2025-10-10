/**
 * Plugin Schema Registry
 *
 * This system allows plugins to register their parameter schemas dynamically,
 * enabling dynamic plugin loading while maintaining type safety and validation.
 */
import { identity } from 'lodash';
import { z } from 'zod/v4';

const t = identity;

/**
 * Registry for plugin parameter schemas
 */
const pluginSchemas = new Map<string, z.ZodType>();

/**
 * Registry for plugin metadata
 */
const pluginMetadata = new Map<string, {
  displayName: string;
  description: string;
}>();

/**
 * Register a plugin parameter schema
 * @param pluginId The plugin ID (should match pluginId enum values)
 * @param schema The Zod schema for this plugin's parameters
 * @param metadata Optional metadata for display purposes
 */
export function registerPluginParameterSchema(
  pluginId: string,
  schema: z.ZodType,
  metadata?: {
    displayName: string;
    description: string;
  },
): void {
  pluginSchemas.set(pluginId, schema);
  if (metadata) {
    pluginMetadata.set(pluginId, metadata);
  }
}

/**
 * Get a plugin parameter schema by ID
 * @param pluginId The plugin ID
 * @returns The schema or undefined if not found
 */
export function getPluginParameterSchema(pluginId: string): z.ZodType | undefined {
  return pluginSchemas.get(pluginId);
}

/**
 * Get all registered plugin IDs
 * @returns Array of all registered plugin IDs
 */
export function getAllRegisteredPluginIds(): string[] {
  return Array.from(pluginSchemas.keys());
}

/**
 * Get plugin metadata
 * @param pluginId The plugin ID
 * @returns Plugin metadata or undefined if not found
 */
export function getPluginMetadata(pluginId: string): { displayName: string; description: string } | undefined {
  return pluginMetadata.get(pluginId);
}

/**
 * Dynamically create the PromptConcatPluginSchema based on registered plugins
 * This is called whenever the schema is needed, ensuring it includes all registered plugins
 */
export function createDynamicPromptConcatPluginSchema(): z.ZodType {
  // Base plugin configuration without parameter-specific fields
  const basePluginSchema = z.object({
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

  // Get all registered plugin IDs
  const registeredPluginIds = getAllRegisteredPluginIds();

  if (registeredPluginIds.length === 0) {
    // Fallback to a basic schema if no plugins are registered yet
    return basePluginSchema.extend({
      pluginId: z.string().meta({
        title: t('Schema.Plugin.PluginIdTitle'),
        description: t('Schema.Plugin.PluginId'),
      }),
    });
  }

  // Create enum from registered plugin IDs
  const pluginIdEnum = z.enum(registeredPluginIds as [string, ...string[]]).meta({
    title: t('Schema.Plugin.PluginIdTitle'),
    description: t('Schema.Plugin.PluginId'),
    enumOptions: registeredPluginIds.map(pluginId => {
      const metadata = getPluginMetadata(pluginId);
      return {
        value: pluginId,
        label: metadata?.displayName || pluginId,
      };
    }),
  });

  // Create parameter schema object with all registered plugins
  const parameterSchema: Record<string, z.ZodType> = {};

  for (const pluginId of registeredPluginIds) {
    const schema = getPluginParameterSchema(pluginId);
    if (schema) {
      const metadata = getPluginMetadata(pluginId);
      parameterSchema[`${pluginId}Param`] = schema.optional().meta({
        title: metadata?.displayName || pluginId,
        description: metadata?.description || `Parameters for ${pluginId} plugin`,
      });
    }
  }

  // Combine base schema with plugin ID and parameters
  return basePluginSchema.extend({
    pluginId: pluginIdEnum,
    ...parameterSchema,
  });
}

/**
 * Get the type of a plugin's parameters
 * @param pluginId The plugin ID
 * @returns The inferred TypeScript type of the plugin's parameters
 */
export type PluginParameterType<T extends string> = T extends keyof ReturnType<typeof createPluginParameterTypes> ? ReturnType<typeof createPluginParameterTypes>[T] : never;

/**
 * Create type definitions for all registered plugin parameters
 * This is used internally for type inference
 */
export function createPluginParameterTypes() {
  const types: Record<string, unknown> = {};

  for (const pluginId of getAllRegisteredPluginIds()) {
    const schema = getPluginParameterSchema(pluginId);
    if (schema) {
      types[pluginId] = schema;
    }
  }

  return types as Record<string, z.ZodType>;
}
