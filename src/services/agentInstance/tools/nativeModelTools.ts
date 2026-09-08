import { toolSchemaToJsonSchema } from 'memeloop';

import type { ToolSchema } from 'memeloop';

/** Project a Desktop tool's declarative schemas into one native provider request. */
export function createNativeModelToolDefinitions(
  schemas: Record<string, ToolSchema>,
) {
  return Object.entries(schemas).map(([name, schema]) => ({
    name,
    inputSchema: toolSchemaToJsonSchema(schema),
  }));
}
