import type { DeviceRelayReservationToken } from 'memeloop';
import { describe, expect, it } from 'vitest';

import { locallyPairedRecord, shouldRenewRelayReservation, validateCloudConfiguration } from '../index';

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
});
