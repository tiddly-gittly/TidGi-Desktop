import type { Device } from 'memeloop';

/**
 * Retain each peer's trust revision across a request, including removal and
 * re-pairing while the remote operation is still running.
 */
export class TrustedPeerRequests {
  private trustedPeers = new Map<string, { trustMode: Device['trustMode'] }>();

  public updateDevices(devices: readonly Device[]): void {
    const next = new Map<string, { trustMode: Device['trustMode'] }>();
    for (const device of devices) {
      if (!device.trusted) continue;
      const current = this.trustedPeers.get(device.peerId);
      next.set(device.peerId, current?.trustMode === device.trustMode ? current : { trustMode: device.trustMode });
    }
    this.trustedPeers = next;
  }

  public async run<T>(peerId: string, isTrusted: () => boolean, operation: () => Promise<T>): Promise<T> {
    const trust = this.trustedPeers.get(peerId);
    if (!isTrusted()) throw new Error(`device_rpc_target_not_trusted:${peerId}`);
    const result = await operation();
    if (trust !== this.trustedPeers.get(peerId) || !isTrusted()) {
      throw new Error(`device_rpc_trust_changed:${peerId}`);
    }
    return result;
  }
}
