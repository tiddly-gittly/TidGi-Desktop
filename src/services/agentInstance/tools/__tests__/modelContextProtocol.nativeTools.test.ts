import { describe, expect, it } from 'vitest';

import { createMCPModelToolDefinitions } from '../modelContextProtocol';

describe('MCP native model tools', () => {
  it('projects discovered MCP schemas into provider-native tool definitions', () => {
    expect(createMCPModelToolDefinitions([{
      name: 'read_file',
      description: 'Read a file',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    }])).toEqual([{
      name: 'mcp-read_file',
      description: 'Read a file',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    }]);
  });

  it('rejects a non-object schema before it reaches a provider request', () => {
    expect(() => createMCPModelToolDefinitions([{
      name: 'invalid',
      inputSchema: [] as unknown as Record<string, unknown>,
    }])).toThrow('MCP tool input schema must be a JSON object');
  });
});
