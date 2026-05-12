import ip from 'ipaddr.js';
import { networkInterfaces, platform, type } from 'os';

/**
 * Copy from https://github.com/sindresorhus/internal-ip, to fix silverwind/default-gateway 's bug
 * @returns
 */
function findIp(gateway: string): string | undefined {
  const gatewayIp = ip.parse(gateway);

  // Look for the matching interface in all local interfaces.
  for (const addresses of Object.values(networkInterfaces())) {
    if (addresses !== undefined) {
      for (const { cidr } of addresses) {
        if (cidr) {
          const net = ip.parseCIDR(cidr);

          if (net[0] && net[0].kind() === gatewayIp.kind() && gatewayIp.match(net)) {
            return net[0].toString();
          }
        }
      }
    }
  }
}

/**
 * Fallback: scan all network interfaces and return the first routable IPv4 address.
 * Skips loopback (127.x), link-local (169.254.x), and well-known virtual adapter ranges
 * used by WSL2 (172.16–31.x), Docker (172.17.x), and Hyper-V (172.x).
 * This is intentionally permissive — we prefer showing a real IP over "localhost".
 */
function findFirstRoutableIpV4(): string | undefined {
  for (const [, addresses] of Object.entries(networkInterfaces())) {
    if (addresses === undefined) continue;
    for (const { address, family, internal } of addresses) {
      if (family !== 'IPv4' || internal) continue;
      // Skip link-local
      if (address.startsWith('169.254.')) continue;
      // Skip common virtual adapter ranges (WSL2, Docker, Hyper-V)
      if (address.startsWith('172.')) continue;
      return address;
    }
  }
  // If nothing matched above, try again without skipping 172.x (user may only have that)
  for (const [, addresses] of Object.entries(networkInterfaces())) {
    if (addresses === undefined) continue;
    for (const { address, family, internal } of addresses) {
      if (family !== 'IPv4' || internal) continue;
      if (address.startsWith('169.254.')) continue;
      return address;
    }
  }
}

export async function internalIpV4(): Promise<string | undefined> {
  try {
    const defaultGatewayResult = await defaultGatewayV4();
    if (defaultGatewayResult?.gateway) {
      const found = findIp(defaultGatewayResult.gateway);
      if (found !== undefined) return found;

      // This commonly happens when WSL2, Docker Desktop, or Hyper-V virtual adapters
      // inject extra default routes whose gateway subnet doesn't match any physical NIC CIDR.
      // Fall through to the interface-scan fallback below.
      console.warn(
        'internalIpV4: default gateway found but no matching network interface CIDR, trying interface scan fallback.',
        'gateway:', defaultGatewayResult.gateway,
      );
    } else {
      console.warn('internalIpV4: defaultGatewayV4 returned no gateway, trying interface scan fallback. Result:', defaultGatewayResult);
    }
  } catch (_error) {
    // best-effort to get default gateway, ignore errors
    console.warn('internalIpV4: failed to get default gateway, trying interface scan fallback.', _error);
  }

  const fallback = findFirstRoutableIpV4();
  if (fallback !== undefined) {
    console.warn('internalIpV4: using interface scan fallback IP:', fallback);
    return fallback;
  }

  console.warn('internalIpV4: no routable IPv4 found at all, returning "localhost".');
  return 'localhost';
}

const supportedPlatforms = new Set(['aix', 'android', 'darwin', 'freebsd', 'linux', 'openbsd', 'sunos', 'win32']);

/**
 * Copy from https://github.com/silverwind/default-gateway 's index.js, to fix its weird behavior on windows. Its require statement will always require sunos
 * @returns
 */
async function defaultGatewayV4(): Promise<IDefaultGatewayInfo | undefined> {
  const plat = platform();

  if (supportedPlatforms.has(plat)) {
    let gatewayQueryFileName: NodeJS.Platform | 'ibmi' = plat;
    if (plat === 'aix') {
      gatewayQueryFileName = type() === 'OS400' ? 'ibmi' : 'sunos'; // AIX `netstat` output is compatible with Solaris
    }

    switch (gatewayQueryFileName) {
      case 'ibmi': {
        const defaultGateway = await import('default-gateway/ibmi');
        return await defaultGateway.v4();
      }
      case 'android': {
        const defaultGateway = await import('default-gateway/android');
        return await defaultGateway.v4();
      }
      case 'darwin': {
        const defaultGateway = await import('default-gateway/darwin');
        return await defaultGateway.v4();
      }
      case 'freebsd': {
        const defaultGateway = await import('default-gateway/freebsd');
        return await defaultGateway.v4();
      }
      case 'linux': {
        const defaultGateway = await import('default-gateway/linux');
        return await defaultGateway.v4();
      }
      case 'openbsd': {
        const defaultGateway = await import('default-gateway/openbsd');
        return await defaultGateway.v4();
      }
      case 'sunos': {
        const defaultGateway = await import('default-gateway/sunos');
        return await defaultGateway.v4();
      }
      case 'win32': {
        const defaultGateway = await import('default-gateway/win32');
        return await defaultGateway.v4();
      }
    }
  }
}
