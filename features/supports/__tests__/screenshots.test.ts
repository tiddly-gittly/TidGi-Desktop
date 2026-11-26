// @vitest-environment node
import fs from 'fs-extra';
import type { ElectronApplication } from 'playwright';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureScreenshot } from '../webContentsViewHelper';

vi.mock('fs-extra', () => ({ default: { writeFile: vi.fn() } }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function fixture() {
  const capturePage = vi.fn().mockResolvedValue({ toPNG: () => Buffer.from([1, 2, 3]) });
  const contents = { id: 7, getURL: () => 'tidgi://wiki', getType: () => 'window', isDestroyed: () => false, capturePage };
  const window = { isDestroyed: () => false, webContents: contents, contentView: { children: [{ webContents: contents }] } };
  const electron = { BrowserWindow: { getAllWindows: () => [window] }, webContents: { fromId: () => contents } };
  const app = {
    windows: () => [],
    evaluate: vi.fn(async (callback: (module: typeof electron, argument: unknown) => unknown, argument: unknown) => await callback(electron, argument)),
  } as unknown as ElectronApplication;
  return { app, capturePage, electron };
}

beforeEach(() => {
  vi.mocked(fs.writeFile).mockResolvedValue();
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe('workspace screenshot', () => {
  it('allows capture to finish beyond 500ms within the calling step deadline', async () => {
    vi.useFakeTimers();
    const { app, capturePage } = fixture();
    capturePage.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 750));
      return { toPNG: () => Buffer.from([1, 2, 3]) };
    });
    const pending = captureScreenshot(app, 'capture.png');
    await vi.advanceTimersByTimeAsync(750);
    await expect(pending).resolves.toBe(true);
    expect(fs.writeFile).toHaveBeenCalledWith('capture.png', Buffer.from([1, 2, 3]));
  });

  it('does not report success until the file has been written', async () => {
    const { app } = fixture();
    const write = deferred<undefined>();
    vi.mocked(fs.writeFile).mockImplementation(() => write.promise);
    let complete = false;
    const pending = captureScreenshot(app, 'capture.png').then((result) => {
      complete = true;
      return result;
    });
    await vi.waitFor(() => {
      expect(fs.writeFile).toHaveBeenCalled();
    });
    expect(complete).toBe(false);
    write.resolve(undefined);
    await expect(pending).resolves.toBe(true);
  });

  it('propagates capture failures', async () => {
    const { app, capturePage } = fixture();
    capturePage.mockRejectedValue(new Error('capture failed'));
    await expect(captureScreenshot(app, 'capture.png')).rejects.toThrow('capture failed');
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('propagates file write failures', async () => {
    const { app } = fixture();
    vi.mocked(fs.writeFile).mockRejectedValue(new Error('disk full'));
    await expect(captureScreenshot(app, 'capture.png')).rejects.toThrow('disk full');
  });

  it('returns false if the target no longer exists', async () => {
    const { app, electron } = fixture();
    electron.BrowserWindow.getAllWindows = () => [];
    await expect(captureScreenshot(app, 'capture.png')).resolves.toBe(false);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});
