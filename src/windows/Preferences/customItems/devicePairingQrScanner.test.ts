// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  boundedPairingQrRasterSize,
  decodeDevicePairingQrFile,
  decodeDevicePairingQrPixels,
  DevicePairingQrCameraScanner,
  DevicePairingQrScannerError,
  MAX_PAIRING_QR_FILE_BYTES,
  MAX_PAIRING_QR_SOURCE_DIMENSION,
  PAIRING_QR_CAMERA_INTERVAL_MS,
} from './devicePairingQrScanner';

function fakeFile(size: number): File {
  return { size } as File;
}

function fakeBitmap(width: number, height: number, close = vi.fn()): ImageBitmap {
  return { close, height, width };
}

function fakeTrack(): MediaStreamTrack {
  return { stop: vi.fn() } as unknown as MediaStreamTrack;
}

function fakeStream(track: MediaStreamTrack): MediaStream {
  return { getTracks: () => [track] } as unknown as MediaStream;
}

function fakeVideo(overrides: Partial<HTMLVideoElement> = {}): HTMLVideoElement {
  return {
    pause: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    readyState: 0,
    srcObject: null,
    videoHeight: 0,
    videoWidth: 0,
    ...overrides,
  } as unknown as HTMLVideoElement;
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('device pairing QR raster limits', () => {
  it('keeps safe input dimensions and bounds both dimension and pixel count', () => {
    expect(boundedPairingQrRasterSize(640, 480, 2048, 4 * 1024 * 1024)).toEqual({ height: 480, width: 640 });
    expect(boundedPairingQrRasterSize(8192, 4096, 2048, 4 * 1024 * 1024)).toEqual({ height: 1024, width: 2048 });

    const bounded = boundedPairingQrRasterSize(4000, 4000, 4000, 1_000_000);
    expect(bounded.width * bounded.height).toBeLessThanOrEqual(1_000_000);
  });

  it.each([
    [0, 1, 10, 100],
    [1, Number.NaN, 10, 100],
    [1, 1, 0, 100],
    [1, 1, 10, -1],
  ])('rejects invalid raster or limit tuple %#', (width, height, maxDimension, maxPixels) => {
    expect(() => boundedPairingQrRasterSize(width, height, maxDimension, maxPixels))
      .toThrow(new DevicePairingQrScannerError('invalid-image'));
  });

  it('rejects RGBA buffers whose byte length does not match the declared raster', () => {
    expect(() => decodeDevicePairingQrPixels(new Uint8ClampedArray(15), 2, 2))
      .toThrow(new DevicePairingQrScannerError('invalid-image'));
  });
});

describe('device pairing QR image ownership', () => {
  it.each(
    [
      [0, 'invalid-image'],
      [MAX_PAIRING_QR_FILE_BYTES + 1, 'image-too-large'],
    ] as const,
  )('rejects file size %s before decoding', async (size, code) => {
    const createBitmap = vi.fn();
    await expect(decodeDevicePairingQrFile(fakeFile(size), {
      createBitmap,
      createCanvas: vi.fn(),
    })).rejects.toMatchObject({ code });
    expect(createBitmap).not.toHaveBeenCalled();
  });

  it('closes a decoded bitmap when source dimensions exceed the hard limit', async () => {
    const close = vi.fn();
    const createCanvas = vi.fn();
    await expect(decodeDevicePairingQrFile(fakeFile(1), {
      createBitmap: async () => fakeBitmap(MAX_PAIRING_QR_SOURCE_DIMENSION + 1, 1, close),
      createCanvas,
    })).rejects.toMatchObject({ code: 'image-too-large' });
    expect(createCanvas).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it('closes a decoded bitmap when canvas extraction fails', async () => {
    const close = vi.fn();
    await expect(decodeDevicePairingQrFile(fakeFile(1), {
      createBitmap: async () => fakeBitmap(320, 320, close),
      createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement,
    })).rejects.toMatchObject({ code: 'invalid-image' });
    expect(close).toHaveBeenCalledOnce();
  });
});

describe('device pairing QR camera ownership', () => {
  it('stops a stream that resolves after disposal without attaching or playing it', async () => {
    const pending = deferred<MediaStream>();
    const track = fakeTrack();
    const stream = fakeStream(track);
    const video = fakeVideo();
    const callbacks = {
      onActiveChange: vi.fn(),
      onError: vi.fn(),
      onPayload: vi.fn(),
    };
    const scanner = new DevicePairingQrCameraScanner(video, callbacks, {
      clearTimer: vi.fn(),
      createCanvas: vi.fn(),
      getUserMedia: () => pending.promise,
      setTimer: vi.fn(),
    });

    const starting = scanner.start();
    scanner.dispose();
    pending.resolve(stream);
    await starting;

    expect(track.stop).toHaveBeenCalledOnce();
    expect(video.play).not.toHaveBeenCalled();
    expect(video.srcObject).toBeNull();
    expect(callbacks.onActiveChange).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it('runs one timer at a time and releases the active stream on disposal', async () => {
    const timers: Array<() => void> = [];
    const clearTimer = vi.fn();
    const setTimer = vi.fn((callback: () => void) => {
      timers.push(callback);
      return timers.length as unknown as ReturnType<typeof globalThis.setTimeout>;
    });
    const track = fakeTrack();
    const stream = fakeStream(track);
    const video = fakeVideo();
    const callbacks = {
      onActiveChange: vi.fn(),
      onError: vi.fn(),
      onPayload: vi.fn(),
    };
    const scanner = new DevicePairingQrCameraScanner(video, callbacks, {
      clearTimer,
      createCanvas: vi.fn(),
      getUserMedia: async () => stream,
      setTimer,
    });

    await scanner.start();
    expect(callbacks.onActiveChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(setTimer).toHaveBeenCalledExactlyOnceWith(expect.any(Function), 0);

    timers.shift()?.();
    expect(setTimer).toHaveBeenLastCalledWith(expect.any(Function), PAIRING_QR_CAMERA_INTERVAL_MS);
    expect(setTimer).toHaveBeenCalledTimes(2);

    scanner.dispose();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(video.pause).toHaveBeenCalled();
    expect(video.srcObject).toBeNull();
    expect(clearTimer).toHaveBeenCalledOnce();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it('reports a frame extraction failure once and stops the camera', async () => {
    let scheduled: (() => void) | undefined;
    const track = fakeTrack();
    const callbacks = {
      onActiveChange: vi.fn(),
      onError: vi.fn(),
      onPayload: vi.fn(),
    };
    const scanner = new DevicePairingQrCameraScanner(
      fakeVideo({
        readyState: 2,
        videoHeight: 320,
        videoWidth: 320,
      }),
      callbacks,
      {
        clearTimer: vi.fn(),
        createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement,
        getUserMedia: async () => fakeStream(track),
        setTimer: (callback) => {
          scheduled = callback;
          return 1 as unknown as ReturnType<typeof globalThis.setTimeout>;
        },
      },
    );

    await scanner.start();
    scheduled?.();

    expect(callbacks.onError).toHaveBeenCalledOnce();
    expect(callbacks.onPayload).not.toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(callbacks.onActiveChange).toHaveBeenNthCalledWith(1, true);
    expect(callbacks.onActiveChange).toHaveBeenNthCalledWith(2, false);
  });
});
