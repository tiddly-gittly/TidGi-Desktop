import type { Device } from 'memeloop';

/**
 * Rejects RPC results when the trusted peer set changes while a request is in
 * flight. The service still performs the authoritative trust lookup before and
 * after transport I/O; this generation closes the remove-then-readd and trust
 * authority replacement races. Rejecting a result cannot undo work that the
 * remote peer may already have performed, so this gate does not claim
 * at-most-once execution semantics.
 */
export class TrustedRpcGate {
  private generation = 0;
  private trustedPeerSignature = '';

  public updateDevices(devices: readonly Device[]): void {
    const nextSignature = devices
      .filter(device => device.trusted === true)
      .map(device => `${device.peerId}\0${device.trustMode}`)
      .sort()
      .join('\n');
    if (nextSignature === this.trustedPeerSignature) return;
    this.trustedPeerSignature = nextSignature;
    this.generation += 1;
  }

  public async run<T>(peerId: string, isTrusted: () => boolean, operation: () => Promise<T>): Promise<T> {
    const generation = this.generation;
    if (!isTrusted()) throw new Error(`device_rpc_target_not_trusted:${peerId}`);
    const result = await operation();
    if (generation !== this.generation || !isTrusted()) {
      throw new Error(`device_rpc_trust_changed:${peerId}`);
    }
    return result;
  }
}
