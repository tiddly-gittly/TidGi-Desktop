import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => process.cwd()),
    whenReady: vi.fn(async () => undefined),
    quit: vi.fn(),
    relaunch: vi.fn(),
  },
  BrowserWindow: Object.assign(
    class MockBrowserWindow {
      readonly mocked = true;
    },
    { getAllWindows: vi.fn(() => []) },
  ),
  screen: {
    getCursorScreenPoint: vi.fn(() => ({ x: 0, y: 0 })),
    getDisplayNearestPoint: vi.fn(() => ({ workAreaSize: { width: 1920, height: 1080 } })),
  },
}));

vi.mock('../registerMenu', () => ({ registerMenu: vi.fn().mockResolvedValue(undefined) }));

import { Window } from '..';
import { registerMenu } from '../registerMenu';

describe('Window startup lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps construction import-safe and registers menus only at the ready boundary', async () => {
    vi.useFakeTimers();
    try {
      const service = new Window({} as never, {} as never);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(registerMenu).not.toHaveBeenCalled();

      await service.initializeMenu();
      expect(registerMenu).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
