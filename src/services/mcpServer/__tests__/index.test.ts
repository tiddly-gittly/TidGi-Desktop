import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockListen = vi.fn((_port: number, _host: string, callback?: () => void) => {
  callback?.();
  return mockServer;
});
const mockOn = vi.fn(() => mockServer);
const mockClose = vi.fn((callback?: () => void) => callback?.());

const mockServer = {
  listen: mockListen,
  on: mockOn,
  close: mockClose,
};

const mockCreateMcpHttpServer = vi.fn(() => mockServer);
const mockWarn = vi.fn();
const mockInfo = vi.fn();
const mockError = vi.fn();

vi.mock('../server', () => ({
  createMcpHttpServer: mockCreateMcpHttpServer,
}));

vi.mock('@services/libs/log', () => ({
  logger: {
    warn: mockWarn,
    info: mockInfo,
    error: mockError,
  },
}));

describe('MCP server startup auth fallback', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('../index');
    module.__resetMcpServerForTests();
  });

  it('starts without token auth when requireToken is enabled but token is empty', async () => {
    const module = await import('../index');

    await module.startMcpServer(38385, true, '   ');

    expect(mockCreateMcpHttpServer).toHaveBeenCalledWith(undefined);
    expect(mockWarn).toHaveBeenCalledWith(
      'MCP server token auth requested but mcpServerToken is empty; starting without token auth',
    );
    expect(mockListen).toHaveBeenCalledWith(38385, '127.0.0.1', expect.any(Function));
  });

  it('starts with token auth when a non-empty token is provided', async () => {
    const module = await import('../index');

    await module.startMcpServer(38385, true, 'secret-token');

    expect(mockCreateMcpHttpServer).toHaveBeenCalledWith({ requireToken: true, token: 'secret-token' });
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('does not start when port is invalid', async () => {
    const module = await import('../index');

    await module.startMcpServer(0, false, '');

    expect(mockCreateMcpHttpServer).not.toHaveBeenCalled();
    expect(mockWarn).toHaveBeenCalledWith('MCP server not started: invalid port 0');
  });

  it('clears server handle after EADDRINUSE so a later start can retry', async () => {
    const module = await import('../index');
    let errorHandler: ((error: NodeJS.ErrnoException) => void) | undefined;
    mockOn.mockImplementation((event: string, handler: (error: NodeJS.ErrnoException) => void) => {
      if (event === 'error') {
        errorHandler = handler;
      }
      return mockServer;
    });

    await module.startMcpServer(38385, false, '');
    expect(mockCreateMcpHttpServer).toHaveBeenCalledTimes(1);
    errorHandler?.(Object.assign(new Error('address already in use'), { code: 'EADDRINUSE' }));

    await module.startMcpServer(38385, false, '');
    expect(mockCreateMcpHttpServer).toHaveBeenCalledTimes(2);
  });
});
