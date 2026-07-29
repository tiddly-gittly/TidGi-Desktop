import { describe, expect, it } from 'vitest';

import { getMCPURLTransportKind } from '../modelContextProtocol';

describe('MCP URL transport selection', () => {
  it('uses Streamable HTTP for modern /mcp endpoints', () => {
    expect(getMCPURLTransportKind('http://127.0.0.1:38385/mcp')).toBe('streamable-http');
    expect(getMCPURLTransportKind('https://example.com/api/mcp/')).toBe('streamable-http');
  });

  it('keeps compatibility with legacy SSE endpoints', () => {
    expect(getMCPURLTransportKind('https://example.com/sse')).toBe('sse');
    expect(getMCPURLTransportKind('https://example.com/mcp/sse/')).toBe('sse');
  });
});
