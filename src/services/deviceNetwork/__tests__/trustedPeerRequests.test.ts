import type { Device } from 'memeloop';
import { describe, expect, it, vi } from 'vitest';

import { TrustedPeerRequests } from '../trustedPeerRequests';

function device(peerId: string, trusted: boolean, trustMode: Device['trustMode'] = 'local-pairing'): Device {
  return {
    peerId,
    displayName: peerId,
    platform: 'cli',
    trustMode,
    trusted,
    reachability: { state: 'online', paths: ['direct'] },
    capabilities: { tools: [], mcpServers: [], hasWiki: false, agentLoop: true, imChannels: [], wikis: [] },
  };
}

describe('TrustedPeerRequests', () => {
  it('rejects an untrusted discovered peer before transport I/O', async () => {
    const requests = new TrustedPeerRequests();
    requests.updateDevices([device('peer-untrusted', false)]);
    const operation = vi.fn(async () => ({ ok: true }));

    await expect(requests.run('peer-untrusted', () => false, operation)).rejects.toThrow(
      'device_rpc_target_not_trusted:peer-untrusted',
    );
    expect(operation).not.toHaveBeenCalled();
  });

  it('returns a trusted peer result while its authorization remains current', async () => {
    const requests = new TrustedPeerRequests();
    requests.updateDevices([device('peer-cli', true)]);

    await expect(requests.run('peer-cli', () => true, async () => ({ ok: true }))).resolves.toEqual({ ok: true });
  });

  it('rejects a result when the peer is revoked while RPC is in flight', async () => {
    const requests = new TrustedPeerRequests();
    requests.updateDevices([device('peer-cli', true)]);
    let trusted = true;
    let finish: ((value: { ok: true }) => void) | undefined;
    const operation = new Promise<{ ok: true }>(resolve => {
      finish = resolve;
    });

    const result = requests.run('peer-cli', () => trusted, () => operation);
    trusted = false;
    requests.updateDevices([device('peer-cli', false)]);
    finish?.({ ok: true });

    await expect(result).rejects.toThrow('device_rpc_trust_changed:peer-cli');
  });

  it('rejects a result when the trusted authority changes while RPC is in flight', async () => {
    const requests = new TrustedPeerRequests();
    requests.updateDevices([device('peer-cli', true, 'local-pairing')]);
    let finish: ((value: { ok: true }) => void) | undefined;
    const operation = new Promise<{ ok: true }>(resolve => {
      finish = resolve;
    });

    const result = requests.run('peer-cli', () => true, () => operation);
    requests.updateDevices([device('peer-cli', true, 'cloud-account')]);
    finish?.({ ok: true });

    await expect(result).rejects.toThrow('device_rpc_trust_changed:peer-cli');
  });

  it.each([false, true])('tracks only the requested peer across directory changes (replace target: %s)', async replaceTarget => {
    const requests = new TrustedPeerRequests();
    requests.updateDevices([device('peer-cli', true), device('peer-other', true)]);
    let finish!: () => void;
    const operation = new Promise<void>(resolve => {
      finish = resolve;
    });
    const result = requests.run('peer-cli', () => true, () => operation);
    requests.updateDevices(replaceTarget ? [device('peer-other', true)] : [device('peer-cli', true)]);
    requests.updateDevices([device('peer-cli', true), device('peer-new', true)]);
    finish();

    if (replaceTarget) {
      await expect(result).rejects.toThrow('device_rpc_trust_changed:peer-cli');
    } else {
      await expect(result).resolves.toBeUndefined();
    }
  });
});
