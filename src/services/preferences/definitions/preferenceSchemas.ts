import { z } from 'zod';

/** Valid TCP port range for locally bound services such as the MCP server. */
export const tcpPortSchema = z.number().int().min(1).max(65535);

export const mcpServerPortSchema = tcpPortSchema;
