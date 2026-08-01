import { beforeEach, describe, expect, it, vi } from 'vitest';

const streamMocks = vi.hoisted(() => {
  const pendingWriteCallbacks: Array<() => void> = [];
  const stream = {
    end: vi.fn((callback: () => void) => {
      callback();
    }),
    once: vi.fn(),
    removeListener: vi.fn(),
    write: vi.fn((_content: string, callback: () => void) => {
      pendingWriteCallbacks.push(callback);
      return true;
    }),
  };
  return {
    createStream: vi.fn(() => stream),
    pendingWriteCallbacks,
    stream,
  };
});

vi.mock('rotating-file-stream', () => ({
  createStream: streamMocks.createStream,
}));

import StructuredFileTransport, { closeStructuredLogStreams } from '../structuredFileTransport';

describe('StructuredFileTransport shutdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    streamMocks.pendingWriteCallbacks.length = 0;
  });

  it('drops queued log writes after shutdown starts instead of writing to an ended stream', async () => {
    const transport = new StructuredFileTransport();
    const firstCallback = vi.fn();
    transport.log({ level: 'info', message: 'before shutdown' }, firstCallback);

    expect(streamMocks.stream.write).toHaveBeenCalledOnce();

    const closePromise = closeStructuredLogStreams();
    const queuedCallback = vi.fn();
    transport.log({ level: 'info', message: 'during shutdown' }, queuedCallback);

    expect(queuedCallback).toHaveBeenCalledOnce();
    expect(streamMocks.stream.write).toHaveBeenCalledOnce();

    streamMocks.pendingWriteCallbacks[0]?.();
    await closePromise;

    expect(firstCallback).toHaveBeenCalledOnce();
    expect(streamMocks.stream.end).toHaveBeenCalledOnce();
  });
});
