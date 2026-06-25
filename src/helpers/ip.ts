import { networkInterfaces } from 'os';

/**
 * Get all local (non-internal, non-loopback, non-link-local) IPv4 addresses.
 * Excludes 0.0.0.0, 127.x.x.x, and 169.254.x.x.
 * Includes 172.x (Docker/WSL2/Hyper-V) since users may have real interfaces on those ranges.
 * @returns Array of IP address strings, e.g. ['192.168.1.100', '10.0.0.5']
 */
export function getAllLocalIpV4(): string[] {
  const preferredIps = new Set<string>();
  const fallbackIps = new Set<string>();
  for (const [, addresses] of Object.entries(networkInterfaces())) {
    if (addresses === undefined) continue;
    for (const { address, family, internal } of addresses) {
      if (family !== 'IPv4' || internal) continue;
      // Skip link-local
      if (address.startsWith('169.254.')) continue;
      // Skip 0.0.0.0
      if (address === '0.0.0.0') continue;
      if (address.startsWith('172.')) {
        fallbackIps.add(address);
      } else {
        preferredIps.add(address);
      }
    }
  }
  return [...preferredIps, ...fallbackIps];
}
