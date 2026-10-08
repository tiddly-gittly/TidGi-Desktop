import { describe, expect, it, vi } from 'vitest';

import { createApplicationActivationGate } from '@/applicationActivationGate';

describe('application activation gate', () => {
  it('waits for complete application initialization and coalesces early activation requests', async () => {
    const openMainWindow = vi.fn(async () => {});
    const gate = createApplicationActivationGate({
      logger: { error: vi.fn() },
      openMainWindow,
    });

    const first = gate.requestMainWindow();
    const second = gate.requestMainWindow();
    await Promise.resolve();
    expect(openMainWindow).not.toHaveBeenCalled();
    expect(second).toBe(first);

    gate.markInitializationReady();
    await first;
    expect(openMainWindow).toHaveBeenCalledTimes(1);
  });

  it('does not open a window after initialization fails', async () => {
    const openMainWindow = vi.fn(async () => {});
    const gate = createApplicationActivationGate({
      logger: { error: vi.fn() },
      openMainWindow,
    });

    const request = gate.requestMainWindow();
    gate.markInitializationFailed();
    await request;

    expect(openMainWindow).not.toHaveBeenCalled();
  });

  it('contains and logs window-open failures instead of creating an unhandled rejection', async () => {
    const error = new Error('window state failed');
    const logger = { error: vi.fn() };
    const gate = createApplicationActivationGate({
      logger,
      openMainWindow: vi.fn(async () => {
        throw error;
      }),
    });

    gate.markInitializationReady();
    await expect(gate.requestMainWindow()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to open main window after application activation',
      { error },
    );
  });
});
