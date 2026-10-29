import fs from 'fs-extra';
import type { ElectronApplication, Page } from 'playwright';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureScreenshot, captureWindowScreenshot } from '../webContentsViewHelper';

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
  const page = { url: () => 'tidgi://wiki' } as Page;
  return { app, page, capturePage, contents, electron };
}

beforeEach(() => {
  vi.mocked(fs.writeFile).mockResolvedValue();
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe.each(
  [
    ['workspace', (app: ElectronApplication, _page: Page) => captureScreenshot(app, 'capture.png')],
    ['window', (app: ElectronApplication, page: Page) => captureWindowScreenshot(app, page, 'capture.png')],
  ] as const,
)('%s screenshot', (_name, capture) => {
  it('allows capture to finish beyond 500ms within the calling step deadline', async () => {
    vi.useFakeTimers();
    const { app, page, capturePage } = fixture();
    capturePage.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 750));
      return { toPNG: () => Buffer.from([1, 2, 3]) };
    });
    const pending = capture(app, page);
    await vi.advanceTimersByTimeAsync(750);
    await expect(pending).resolves.toBe(true);
    expect(fs.writeFile).toHaveBeenCalledWith('capture.png', Buffer.from([1, 2, 3]));
  });

  it('does not report success until the file has been written', async () => {
    const { app, page } = fixture();
    const write = deferred<undefined>();
    vi.mocked(fs.writeFile).mockImplementation(() => write.promise);
    let complete = false;
    const pending = capture(app, page).then((result) => {
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
    const { app, page, capturePage } = fixture();
    capturePage.mockRejectedValue(new Error('capture failed'));
    await expect(capture(app, page)).rejects.toThrow('capture failed');
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('propagates file write failures', async () => {
    const { app, page } = fixture();
    vi.mocked(fs.writeFile).mockRejectedValue(new Error('disk full'));
    await expect(capture(app, page)).rejects.toThrow('disk full');
  });

  it('returns false if the target no longer exists', async () => {
    const { app, page, electron } = fixture();
    electron.BrowserWindow.getAllWindows = () => [];
    await expect(capture(app, page)).resolves.toBe(false);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});
