import { networkInterfaces } from 'os';
import { defaultServerIP } from '@/constants/urls';
import { logger } from './log';

const nets = networkInterfaces();
/**
 * Contains all available ip address.
 * ```js
 * { en0: [ '192.168.50.112' ] }
 * ```
 * node-ip sometimes gives wrong address, so we get address by ourself.
 * @docs https://stackoverflow.com/questions/3653065/get-local-ip-address-in-node-js
 */
export const ipAddresses: Record<string, string[]> = {};

for (const name in nets) {
  for (const net of nets[name]!) {
    // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
    if (net.family === 'IPv4' && !net.internal) {
      if (ipAddresses[name] === undefined) {
        ipAddresses[name] = [];
      }
      ipAddresses[name].push(net.address);
    }
  }
}

export function getAvailableIPAddress(): string | undefined {
  return ipAddresses.en0?.[0] ?? ipAddresses.eth0?.[0];
}

/**
 * get wiki address with local machine ip, so QR code will be correct, instead of get `0.0.0.0`
 * https://github.com/Jermolene/TiddlyWiki5/issues/5669
 * @param originalUrl might be `"http://0.0.0.0:5212/"`
 */
export function getLocalHostUrlWithActualIP(originalUrl: string): string {
  const localHostUrlWithActualIP = originalUrl.replace(defaultServerIP, getAvailableIPAddress() ?? defaultServerIP);
  logger.debug(
    `Current available address: ${JSON.stringify(ipAddresses, undefined, '  ')}\nand getAvailableIPAddress() returns ${getAvailableIPAddress() ?? 'undefined'}
    originalUrl: ${originalUrl} , localHostUrlWithActualIP ${localHostUrlWithActualIP}`,
  );
  return localHostUrlWithActualIP;
}
