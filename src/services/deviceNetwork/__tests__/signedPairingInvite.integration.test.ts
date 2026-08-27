// @vitest-environment node

import { createDeviceIdentity, parseVerifiedDevicePairingInvite } from '@memeloop/libp2p';
import { BrowserQRCodeSvgWriter } from '@zxing/browser';
import { BinaryBitmap, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from '@zxing/library';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDesktopSignedPairingInvitePayload } from '../index';

const CREATED_AT = Date.UTC(2026, 7, 27, 8, 0, 0);
const INVITE_TTL_MS = 5 * 60_000;
const QR_SIZE = 320;
const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new(html?: string) => { window: { document: Document } };
};

beforeAll(() => {
  vi.stubGlobal('document', new JSDOM('<!doctype html>').window.document);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

/**
 * Rasterizes the SVG emitted by Desktop's production QR writer and runs it
 * through ZXing's QR detector/decoder. Reading DOM text or retaining the input
 * payload here would allow a broken QR image to pass this integration test.
 */
function decodePairingInviteQr(svg: SVGSVGElement): string {
  const width = Number.parseInt(svg.getAttribute('width') ?? '', 10);
  const height = Number.parseInt(svg.getAttribute('height') ?? '', 10);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error('invalid QR SVG dimensions');
  }

  const luminance = new Uint8ClampedArray(width * height);
  luminance.fill(255);
  for (const rect of svg.querySelectorAll('rect')) {
    const left = Number.parseInt(rect.getAttribute('x') ?? '', 10);
    const top = Number.parseInt(rect.getAttribute('y') ?? '', 10);
    const rectWidth = Number.parseInt(rect.getAttribute('width') ?? '', 10);
    const rectHeight = Number.parseInt(rect.getAttribute('height') ?? '', 10);
    for (let y = top; y < top + rectHeight; y++) {
      luminance.fill(0, y * width + left, y * width + left + rectWidth);
    }
  }

  const source = new RGBLuminanceSource(luminance, width, height);
  const bitmap = new BinaryBitmap(new HybridBinarizer(source));
  return new QRCodeReader().decode(bitmap).getText();
}

function qrRoundTrip(payload: string): string {
  const svg = new BrowserQRCodeSvgWriter().write(payload, QR_SIZE, QR_SIZE);
  return decodePairingInviteQr(svg);
}

describe('Desktop signed pairing invite QR integration', () => {
  it('binds the real identity, PeerId, public key, signature, and dialable addresses through a decoded QR image', async () => {
    const identity = await createDeviceIdentity('desktop', 'Desktop QR integration');
    const payload = await createDesktopSignedPairingInvitePayload(identity, [
      '/ip4/127.0.0.1/tcp/41001/ws',
      '/ip4/192.168.50.10/tcp/41001/ws',
      '/dns4/desktop.lan/tcp/443/wss',
      '/ip4/192.168.50.10/tcp/41001/ws',
    ], {
      now: CREATED_AT,
      ttlMs: INVITE_TTL_MS,
    });

    const decodedPayload = qrRoundTrip(payload);
    expect(decodedPayload).toBe(payload);

    const verified = await parseVerifiedDevicePairingInvite(decodedPayload, { now: CREATED_AT + 1 });
    expect(verified).toMatchObject({
      protocol: 'memeloop-device-pairing-v2',
      peerId: identity.peerId,
      publicKeyMultibase: identity.publicKeyMultibase,
      deviceName: identity.deviceName,
      createdAt: CREATED_AT,
      expiresAt: CREATED_AT + INVITE_TTL_MS,
    });
    expect(verified.signature.length).toBeGreaterThan(40);
    expect(verified.multiaddrs).toEqual([
      `/dns4/desktop.lan/tcp/443/wss/p2p/${identity.peerId}`,
      `/ip4/192.168.50.10/tcp/41001/ws/p2p/${identity.peerId}`,
    ]);
    expect(verified.multiaddrs.every(address => address.endsWith(`/p2p/${identity.peerId}`))).toBe(true);
  });

  it('rejects identity-bound content tampered after a real QR encode/decode', async () => {
    const identity = await createDeviceIdentity('desktop', 'Desktop QR tamper source');
    const payload = await createDesktopSignedPairingInvitePayload(
      identity,
      ['/ip4/192.168.50.11/tcp/41001/ws'],
      { now: CREATED_AT, ttlMs: INVITE_TTL_MS },
    );
    const record = JSON.parse(qrRoundTrip(payload)) as { deviceName: string };
    record.deviceName = 'Desktop QR tamper target';

    const tamperedPayload = qrRoundTrip(JSON.stringify(record));
    await expect(parseVerifiedDevicePairingInvite(tamperedPayload, { now: CREATED_AT + 1 }))
      .rejects.toThrow(/identity verification/i);
  });

  it('rejects a QR invite whose multiaddr is rebound to another PeerId', async () => {
    const [identity, attacker] = await Promise.all([
      createDeviceIdentity('desktop', 'Desktop QR binding source'),
      createDeviceIdentity('desktop', 'Desktop QR binding attacker'),
    ]);
    const payload = await createDesktopSignedPairingInvitePayload(
      identity,
      ['/ip4/192.168.50.12/tcp/41001/ws'],
      { now: CREATED_AT, ttlMs: INVITE_TTL_MS },
    );
    const record = JSON.parse(qrRoundTrip(payload)) as { multiaddrs: string[] };
    record.multiaddrs = [`/ip4/192.168.50.12/tcp/41001/ws/p2p/${attacker.peerId}`];

    const reboundPayload = qrRoundTrip(JSON.stringify(record));
    await expect(parseVerifiedDevicePairingInvite(reboundPayload, { now: CREATED_AT + 1 }))
      .rejects.toThrow(/PeerId|peer id/i);
  });
});
