/**
 * Tool Registry — registration and lookup of tools created with defineTool.
 *
 * Extracted from defineTool.ts to reduce file size.
 */
import type { z } from 'zod/v4';
import { defineTool } from './defineTool';
import type { DefinedTool, ToolDefinition } from './defineToolTypes';
import { registerToolParameterSchema } from './schemaRegistry';

/**
 * Global registry for tools created with defineTool
 */
const toolRegistry = new Map<string, DefinedTool>();

/**
 * Register a tool definition: validates, stores, and creates the tool.
 */
export function registerToolDefinition<
  TConfigSchema extends z.ZodType,
  TLLMToolSchemas extends Record<string, z.ZodType>,
>(definition: ToolDefinition<TConfigSchema, TLLMToolSchemas>): DefinedTool<TConfigSchema, TLLMToolSchemas> {
  const toolDefinition = defineTool(definition);

  // Register tool parameter schema and metadata for dynamic schema generation
  registerToolParameterSchema(toolDefinition.toolId, toolDefinition.configSchema, {
    displayName: toolDefinition.displayName,
    description: toolDefinition.description,
  });

  toolRegistry.set(toolDefinition.toolId, toolDefinition as DefinedTool);
  return toolDefinition;
}

/**
 * Get all registered tool definitions
 */
export function getAllToolDefinitions(): Map<string, DefinedTool> {
  return toolRegistry;
}

/**
 * Get a tool definition by ID
 */
export function getToolDefinition(toolId: string): DefinedTool | undefined {
  return toolRegistry.get(toolId);
}
