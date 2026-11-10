import { describe, expect, it, vi } from 'vitest';

import { createMCPModelToolDefinitions, ModelContextProtocolParameterSchema, resolveMCPHostConnection } from '../modelContextProtocol';

describe('MCP native model tools', () => {
  it('follows host port and token settings for legacy builtins and skips a disabled host', async () => {
    const settings = { mcpServerEnabled: true, mcpServerPort: 28285, mcpServerRequireToken: true, mcpServerToken: ' test-token ' };
    const preferences = { get: vi.fn(async (key: keyof typeof settings) => settings[key]) };
    const getPreferences = () => preferences as unknown as ReturnType<Parameters<typeof resolveMCPHostConnection>[2]>;
    const config = ModelContextProtocolParameterSchema.parse({ serverUrl: 'http://127.0.0.1:38385/mcp' });
    const result = await resolveMCPHostConnection(config, 'memeloop:general-assistant', getPreferences);
    expect(result).toMatchObject({ config: { serverUrl: 'http://127.0.0.1:28285/mcp' }, token: 'test-token' });
    expect(config.serverUrl).toBe('http://127.0.0.1:38385/mcp');
    settings.mcpServerEnabled = false;
    expect(await resolveMCPHostConnection(config, 'memeloop:general-assistant', getPreferences)).toBeUndefined();
  });

  it.each([
    { serverUrl: 'http://custom/mcp' },
    { serverUrl: 'http://127.0.0.1:38385/mcp', useHostServer: false },
    { command: 'custom-mcp', serverUrl: 'http://127.0.0.1:38385/mcp' },
  ])('does not override explicit external MCP configuration %s', async input => {
    const config = ModelContextProtocolParameterSchema.parse(input);
    const getPreferences = vi.fn();
    expect(await resolveMCPHostConnection(config, 'memeloop:general-assistant', getPreferences)).toEqual({ config });
    expect(getPreferences).not.toHaveBeenCalled();
  });
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
    expect(() =>
      createMCPModelToolDefinitions([{
        name: 'invalid',
        inputSchema: [] as unknown as Record<string, unknown>,
      }])
    ).toThrow('MCP tool input schema must be a JSON object');
  });
});
