import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installApplicationQuitLifecycle, type QuitEventLike } from '../applicationQuitLifecycle';

class FakeApp extends EventEmitter {
  public readonly exit = vi.fn();
}

describe('installApplicationQuitLifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('aborts startup and drains the network before runtime/storage cleanup exactly once', async () => {
    const order: string[] = [];
    const app = new FakeApp();
    const abortStartup = vi.fn(() => order.push('abort'));
    let resolveNetworkStop!: () => void;
    const stopNetwork = vi.fn(() => {
      order.push('network');
      return new Promise<void>(resolve => {
        resolveNetworkStop = resolve;
      });
    });
    let resolveCleanup!: () => void;
    const cleanup = vi.fn(() => {
      order.push('cleanup');
      return new Promise<void>(resolve => {
        resolveCleanup = resolve;
      });
    });
    const beforeEvent = { preventDefault: vi.fn() };
    const willEvent = { preventDefault: vi.fn() };
    installApplicationQuitLifecycle({
      abortStartup,
      app,
      stopNetwork,
      cleanup,
      logger: { error: vi.fn(), warn: vi.fn() },
    });

    app.emit('before-quit', beforeEvent satisfies QuitEventLike);
    app.emit('will-quit', willEvent satisfies QuitEventLike);
    expect(order).toEqual(['abort', 'network']);
    expect(abortStartup).toHaveBeenCalledOnce();
    expect(stopNetwork).toHaveBeenCalledOnce();
    expect(cleanup).not.toHaveBeenCalled();
    expect(beforeEvent.preventDefault).toHaveBeenCalledOnce();
    expect(willEvent.preventDefault).toHaveBeenCalledOnce();

    expect(app.exit).not.toHaveBeenCalled();
    resolveNetworkStop();
    await vi.waitFor(() => {
      expect(cleanup).toHaveBeenCalledOnce();
    });
    expect(order).toEqual(['abort', 'network', 'cleanup']);
    app.emit('before-quit', beforeEvent satisfies QuitEventLike);
    expect(stopNetwork).toHaveBeenCalledOnce();
    resolveCleanup();
    await vi.waitFor(() => {
      expect(app.exit).toHaveBeenCalledWith(0);
    });
    expect(app.exit).toHaveBeenCalledOnce();
  });

  it('forces one app-local exit at the cleanup deadline', async () => {
    vi.useFakeTimers();
    const app = new FakeApp();
    const cleanup = vi.fn(() => new Promise<void>(() => undefined));
    const logger = { error: vi.fn(), warn: vi.fn() };
    installApplicationQuitLifecycle({
      abortStartup: vi.fn(),
      app,
      stopNetwork: vi.fn(async () => {}),
      cleanup,
      forceExitAfterMs: 15_000,
      logger,
    });

    app.emit('before-quit', { preventDefault: vi.fn() } satisfies QuitEventLike);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(app.exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(app.exit).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith('before-quit cleanup timed out after 15000 ms, forcing exit');
  });

  it('still releases runtime/storage if network shutdown rejects', async () => {
    const app = new FakeApp();
    const failure = new Error('network shutdown failed');
    const cleanup = vi.fn(async () => {});
    const logger = { error: vi.fn(), warn: vi.fn() };
    installApplicationQuitLifecycle({
      abortStartup: vi.fn(),
      app,
      stopNetwork: vi.fn(async () => {
        throw failure;
      }),
      cleanup,
      logger,
    });
    app.emit('before-quit', { preventDefault: vi.fn() } satisfies QuitEventLike);
    await vi.waitFor(() => {
      expect(app.exit).toHaveBeenCalledOnce();
    });
    expect(cleanup).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith('before-quit device network stop failed', { error: failure });
  });
});
