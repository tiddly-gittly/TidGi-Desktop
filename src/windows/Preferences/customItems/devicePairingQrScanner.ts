import jsQR from 'jsqr';

export const MAX_PAIRING_QR_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_PAIRING_QR_SOURCE_DIMENSION = 8192;
export const MAX_PAIRING_QR_SOURCE_PIXELS = 16 * 1024 * 1024;
export const MAX_PAIRING_QR_IMAGE_DIMENSION = 2048;
export const MAX_PAIRING_QR_IMAGE_PIXELS = 4 * 1024 * 1024;
export const MAX_PAIRING_QR_CAMERA_DIMENSION = 1280;
export const MAX_PAIRING_QR_CAMERA_PIXELS = 1_500_000;
export const PAIRING_QR_CAMERA_INTERVAL_MS = 250;

export type DevicePairingQrScannerErrorCode = 'image-too-large' | 'invalid-image' | 'not-found';

export class DevicePairingQrScannerError extends Error {
  public constructor(public readonly code: DevicePairingQrScannerErrorCode) {
    super(`device_pairing_qr_${code.replaceAll('-', '_')}`);
    this.name = 'DevicePairingQrScannerError';
  }
}

interface RasterSize {
  height: number;
  width: number;
}

interface PairingQrImageDependencies {
  createBitmap(file: File): Promise<ImageBitmap>;
  createCanvas(): HTMLCanvasElement;
}

interface PairingQrCameraDependencies {
  clearTimer(timer: ReturnType<typeof globalThis.setTimeout>): void;
  createCanvas(): HTMLCanvasElement;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  setTimer(callback: () => void, delayMs: number): ReturnType<typeof globalThis.setTimeout>;
}

export interface DevicePairingQrCameraCallbacks {
  onActiveChange(active: boolean): void;
  onError(): void;
  onPayload(payload: string): void;
}

const defaultImageDependencies: PairingQrImageDependencies = {
  createBitmap: file => globalThis.createImageBitmap(file),
  createCanvas: () => document.createElement('canvas'),
};

const defaultCameraDependencies: PairingQrCameraDependencies = {
  clearTimer: (timer) => {
    globalThis.clearTimeout(timer);
  },
  createCanvas: () => document.createElement('canvas'),
  getUserMedia: constraints => navigator.mediaDevices.getUserMedia(constraints),
  setTimer: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
};

function checkedPixelCount(width: number, height: number): number {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new DevicePairingQrScannerError('invalid-image');
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels)) throw new DevicePairingQrScannerError('invalid-image');
  return pixels;
}

function checkedPositiveLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new DevicePairingQrScannerError('invalid-image');
  return value;
}

export function boundedPairingQrRasterSize(
  width: number,
  height: number,
  maxDimension: number,
  maxPixels: number,
): RasterSize {
  const pixels = checkedPixelCount(width, height);
  const dimensionLimit = checkedPositiveLimit(maxDimension);
  const pixelLimit = checkedPositiveLimit(maxPixels);
  const scale = Math.min(1, dimensionLimit / width, dimensionLimit / height, Math.sqrt(pixelLimit / pixels));
  return {
    height: Math.max(1, Math.floor(height * scale)),
    width: Math.max(1, Math.floor(width * scale)),
  };
}

export function decodeDevicePairingQrPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): string | undefined {
  const pixels = checkedPixelCount(width, height);
  if (pixels > Number.MAX_SAFE_INTEGER / 4) throw new DevicePairingQrScannerError('invalid-image');
  if (data.byteLength !== pixels * 4) throw new DevicePairingQrScannerError('invalid-image');
  return jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })?.data;
}

function drawAndDecode(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  limits: { maxDimension: number; maxPixels: number },
): string | undefined {
  const size = boundedPairingQrRasterSize(sourceWidth, sourceHeight, limits.maxDimension, limits.maxPixels);
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new DevicePairingQrScannerError('invalid-image');
  context.imageSmoothingEnabled = false;
  context.drawImage(source, 0, 0, size.width, size.height);
  const image = context.getImageData(0, 0, size.width, size.height);
  return decodeDevicePairingQrPixels(image.data, size.width, size.height);
}

export async function decodeDevicePairingQrFile(
  file: File,
  dependencies: PairingQrImageDependencies = defaultImageDependencies,
): Promise<string> {
  if (file.size <= 0) throw new DevicePairingQrScannerError('invalid-image');
  if (file.size > MAX_PAIRING_QR_FILE_BYTES) throw new DevicePairingQrScannerError('image-too-large');
  const bitmap = await dependencies.createBitmap(file);
  try {
    const pixels = checkedPixelCount(bitmap.width, bitmap.height);
    if (
      bitmap.width > MAX_PAIRING_QR_SOURCE_DIMENSION ||
      bitmap.height > MAX_PAIRING_QR_SOURCE_DIMENSION ||
      pixels > MAX_PAIRING_QR_SOURCE_PIXELS
    ) {
      throw new DevicePairingQrScannerError('image-too-large');
    }
    const payload = drawAndDecode(dependencies.createCanvas(), bitmap, bitmap.width, bitmap.height, {
      maxDimension: MAX_PAIRING_QR_IMAGE_DIMENSION,
      maxPixels: MAX_PAIRING_QR_IMAGE_PIXELS,
    });
    if (!payload) throw new DevicePairingQrScannerError('not-found');
    return payload;
  } finally {
    bitmap.close();
  }
}

function stopTracks(stream: MediaStream | undefined): void {
  for (const track of stream?.getTracks() ?? []) track.stop();
}

/** Owns one serial camera scan loop and fences every delayed browser result. */
export class DevicePairingQrCameraScanner {
  private active = false;
  private disposed = false;
  private generation = 0;
  private stream?: MediaStream;
  private timer?: ReturnType<typeof globalThis.setTimeout>;

  public constructor(
    private readonly video: HTMLVideoElement,
    private readonly callbacks: DevicePairingQrCameraCallbacks,
    private readonly dependencies: PairingQrCameraDependencies = defaultCameraDependencies,
  ) {}

  public async start(): Promise<void> {
    this.assertNotDisposed();
    this.stop();
    const generation = this.generation;
    try {
      const stream = await this.dependencies.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' } },
      });
      if (!this.isCurrent(generation)) {
        stopTracks(stream);
        return;
      }
      this.stream = stream;
      this.video.srcObject = stream;
      await this.video.play();
      if (!this.isCurrent(generation)) {
        stopTracks(stream);
        if (this.video.srcObject === stream) this.video.srcObject = null;
        return;
      }
      this.setActive(true);
      this.schedule(generation, 0);
    } catch {
      if (!this.isCurrent(generation)) return;
      this.stop();
      this.callbacks.onError();
    }
  }

  public stop(): void {
    this.generation += 1;
    if (this.timer !== undefined) {
      this.dependencies.clearTimer(this.timer);
      this.timer = undefined;
    }
    const stream = this.stream;
    this.stream = undefined;
    stopTracks(stream);
    this.video.pause();
    if (this.video.srcObject === stream || stream === undefined) this.video.srcObject = null;
    this.setActive(false);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
  }

  private assertNotDisposed(): void {
    if (this.disposed) throw new Error('device_pairing_qr_camera_disposed');
  }

  private isCurrent(generation: number): boolean {
    return !this.disposed && generation === this.generation;
  }

  private setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    if (!this.disposed) this.callbacks.onActiveChange(active);
  }

  private schedule(generation: number, delayMs: number): void {
    if (!this.isCurrent(generation)) return;
    this.timer = this.dependencies.setTimer(() => {
      this.timer = undefined;
      this.scanFrame(generation);
    }, delayMs);
  }

  private scanFrame(generation: number): void {
    if (!this.isCurrent(generation)) return;
    try {
      // HAVE_CURRENT_DATA is 2. Keep the scanner independent of a global
      // HTMLMediaElement constructor so it is also deterministic in JSDOM.
      if (this.video.readyState >= 2 && this.video.videoWidth > 0 && this.video.videoHeight > 0) {
        const payload = drawAndDecode(
          this.dependencies.createCanvas(),
          this.video,
          this.video.videoWidth,
          this.video.videoHeight,
          { maxDimension: MAX_PAIRING_QR_CAMERA_DIMENSION, maxPixels: MAX_PAIRING_QR_CAMERA_PIXELS },
        );
        if (payload) {
          this.callbacks.onPayload(payload);
          this.stop();
          return;
        }
      }
      this.schedule(generation, PAIRING_QR_CAMERA_INTERVAL_MS);
    } catch {
      if (!this.isCurrent(generation)) return;
      this.stop();
      this.callbacks.onError();
    }
  }
}
