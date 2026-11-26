import type { ToolSchema } from 'memeloop';
import { localizeToolSchema } from './localizeToolSchema';

/** Project a Desktop tool's declarative schemas into one native provider request. */
export function createNativeModelToolDefinitions(
  schemas: Record<string, ToolSchema>,
) {
  return Object.entries(schemas).map(([name, schema]) => {
    const inputSchema = localizeToolSchema(schema);
    return { name, inputSchema };
  });
}
