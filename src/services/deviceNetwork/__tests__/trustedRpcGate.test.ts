import type { Device } from 'memeloop';
import { describe, expect, it, vi } from 'vitest';

import { TrustedRpcGate } from '../trustedRpcGate';

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

describe('TrustedRpcGate', () => {
  it('rejects an untrusted discovered peer before transport I/O', async () => {
    const gate = new TrustedRpcGate();
    gate.updateDevices([device('peer-untrusted', false)]);
    const operation = vi.fn(async () => ({ ok: true }));

    await expect(gate.run('peer-untrusted', () => false, operation)).rejects.toThrow(
      'device_rpc_target_not_trusted:peer-untrusted',
    );
    expect(operation).not.toHaveBeenCalled();
  });

  it('returns a trusted peer result when the trust generation remains current', async () => {
    const gate = new TrustedRpcGate();
    gate.updateDevices([device('peer-cli', true)]);

    await expect(gate.run('peer-cli', () => true, async () => ({ ok: true }))).resolves.toEqual({ ok: true });
  });

  it('rejects a result when the peer is revoked while RPC is in flight', async () => {
    const gate = new TrustedRpcGate();
    gate.updateDevices([device('peer-cli', true)]);
    let trusted = true;
    let finish: ((value: { ok: true }) => void) | undefined;
    const operation = new Promise<{ ok: true }>(resolve => {
      finish = resolve;
    });

    const result = gate.run('peer-cli', () => trusted, () => operation);
    trusted = false;
    gate.updateDevices([device('peer-cli', false)]);
    finish?.({ ok: true });

    await expect(result).rejects.toThrow('device_rpc_trust_changed:peer-cli');
  });

  it('rejects a result when the trusted authority changes while RPC is in flight', async () => {
    const gate = new TrustedRpcGate();
    gate.updateDevices([device('peer-cli', true, 'local-pairing')]);
    let finish: ((value: { ok: true }) => void) | undefined;
    const operation = new Promise<{ ok: true }>(resolve => {
      finish = resolve;
    });

    const result = gate.run('peer-cli', () => true, () => operation);
    gate.updateDevices([device('peer-cli', true, 'cloud-account')]);
    finish?.({ ok: true });

    await expect(result).rejects.toThrow('device_rpc_trust_changed:peer-cli');
  });
});
