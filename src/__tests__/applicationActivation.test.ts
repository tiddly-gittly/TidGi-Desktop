import { describe, expect, it, vi } from 'vitest';

import { createApplicationActivationHandler } from '@/applicationActivation';

describe('application activation', () => {
  it('waits for complete application initialization and coalesces early activation requests', async () => {
    const openMainWindow = vi.fn(async () => {});
    const activation = createApplicationActivationHandler({
      logger: { error: vi.fn() },
      openMainWindow,
    });

    const first = activation.requestMainWindow();
    const second = activation.requestMainWindow();
    await Promise.resolve();
    expect(openMainWindow).not.toHaveBeenCalled();
    expect(second).toBe(first);

    activation.markInitializationReady();
    await first;
    expect(openMainWindow).toHaveBeenCalledTimes(1);
    await activation.requestMainWindow();
    expect(openMainWindow).toHaveBeenCalledTimes(2);
  });

  it('does not open a window after initialization fails', async () => {
    const openMainWindow = vi.fn(async () => {});
    const activation = createApplicationActivationHandler({
      logger: { error: vi.fn() },
      openMainWindow,
    });

    const request = activation.requestMainWindow();
    activation.markInitializationFailed();
    await request;

    activation.markInitializationReady();
    await activation.requestMainWindow();
    expect(openMainWindow).not.toHaveBeenCalled();
  });

  it('contains and logs window-open failures instead of creating an unhandled rejection', async () => {
    const error = new Error('window state failed');
    const logger = { error: vi.fn() };
    const activation = createApplicationActivationHandler({
      logger,
      openMainWindow: vi.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined),
    });

    activation.markInitializationReady();
    await expect(activation.requestMainWindow()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to open main window after application activation',
      { error },
    );
    await activation.requestMainWindow();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
