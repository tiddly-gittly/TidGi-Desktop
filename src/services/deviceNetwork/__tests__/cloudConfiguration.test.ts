import type { DeviceRelayReservationToken } from 'memeloop';
import { describe, expect, it } from 'vitest';

import {
  classifyCloudConnectionError,
  hasValidDirectDeviceAddress,
  locallyPairedRecord,
  pairingInviteMultiaddrs,
  shouldRenewRelayReservation,
  validateCloudConfiguration,
} from '../index';

function reservation(expiresAt: number): DeviceRelayReservationToken {
  return {
    issuer: 'memeloop-cloud',
    accountId: 'account-1',
    peerId: 'peer-1',
    relayMultiaddrs: [],
    bootstrapMultiaddrs: [],
    issuedAt: 1,
    expiresAt,
    signature: 'signature',
  };
}

describe('DeviceNetwork Cloud configuration', () => {
  it('accepts HTTPS and normalizes the service origin', () => {
    expect(validateCloudConfiguration({
      cloudUrl: ' https://cloud.example.test/ ',
      accessToken: ' token-value ',
    })).toEqual({
      cloudUrl: 'https://cloud.example.test',
      accessToken: 'token-value',
    });
  });

  it('allows HTTP only for loopback development endpoints', () => {
    expect(
      validateCloudConfiguration({
        cloudUrl: 'http://127.0.0.1:4000',
        accessToken: 'token',
      }).cloudUrl,
    ).toBe('http://127.0.0.1:4000');
    expect(() =>
      validateCloudConfiguration({
        cloudUrl: 'http://cloud.example.test',
        accessToken: 'token',
      })
    ).toThrow('cloud_url_requires_https');
  });

  it('rejects embedded credentials, paths, query strings, and empty tokens', () => {
    for (
      const cloudUrl of [
        'https://user:password@cloud.example.test',
        'https://cloud.example.test/api',
        'https://cloud.example.test?token=secret',
        'https://cloud.example.test#fragment',
      ]
    ) {
      expect(() => validateCloudConfiguration({ cloudUrl, accessToken: 'token' })).toThrow('invalid_cloud_url');
    }
    expect(() =>
      validateCloudConfiguration({
        cloudUrl: 'https://cloud.example.test',
        accessToken: '   ',
      })
    ).toThrow('invalid_cloud_access_token');
  });

  it('renews a missing or nearly expired relay reservation', () => {
    const now = 10_000;
    expect(shouldRenewRelayReservation(undefined, now)).toBe(true);
    expect(shouldRenewRelayReservation(reservation(now + 119_999), now)).toBe(true);
    expect(shouldRenewRelayReservation(reservation(now + 120_001), now)).toBe(false);
  });

  it('allows only explicit local pairing to bypass a Cloud grant', () => {
    const baseRecord = {
      peerId: 'peer-1',
      publicKeyMultibase: 'zPublicKey',
      deviceName: 'Peer',
      platform: 'desktop' as const,
      createdAt: 1,
    };
    const localRecord = { ...baseRecord, trustMode: 'local-pairing' as const };
    const cloudRecord = { ...baseRecord, trustMode: 'cloud-account' as const, accountId: 'account-1' };

    expect(locallyPairedRecord(localRecord)).toBe(localRecord);
    expect(locallyPairedRecord(cloudRecord)).toBeUndefined();
    expect(locallyPairedRecord(undefined)).toBeUndefined();
  });

  it('requires relay only when no externally dialable direct address exists', () => {
    expect(hasValidDirectDeviceAddress([
      '/ip4/0.0.0.0/tcp/4001/ws',
      '/ip4/127.0.0.1/tcp/4001/ws',
      '/ip4/10.0.0.8/tcp/4001/ws/p2p/peer-1/p2p-circuit',
    ])).toBe(false);
    expect(hasValidDirectDeviceAddress(['/ip4/192.168.1.20/tcp/4001/ws/p2p/peer-1'])).toBe(true);
    expect(hasValidDirectDeviceAddress(['/dns4/device.example.test/tcp/443/wss/p2p/peer-1'])).toBe(true);
  });

  it('builds only PeerId-bound dialable WebSocket invitation addresses', () => {
    expect(pairingInviteMultiaddrs([
      '/ip4/0.0.0.0/tcp/4001/ws',
      '/ip4/192.168.1.20/tcp/4001',
      '/ip4/192.168.1.20/tcp/4001/ws',
      '/ip4/192.168.1.20/tcp/4001/ws',
    ], 'peer-1')).toEqual(['/ip4/192.168.1.20/tcp/4001/ws/p2p/peer-1']);
    expect(() => pairingInviteMultiaddrs(['/ip4/127.0.0.1/tcp/4001/ws'], 'peer-1'))
      .toThrow('no_dialable_websocket_address');
  });

  it('classifies account errors separately from offline transport failures', () => {
    expect(classifyCloudConnectionError(new Error('401 unauthorized'))).toBe('error');
    expect(classifyCloudConnectionError(new TypeError('fetch failed'))).toBe('offline');
  });
});
