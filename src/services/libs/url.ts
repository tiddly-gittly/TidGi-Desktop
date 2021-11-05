import { internalIpV4 } from 'internal-ip';
import { defaultServerIP } from '@/constants/urls';
import { logger } from './log';

/**
 * get wiki address with local machine ip, so QR code will be correct, instead of get `0.0.0.0`
 * https://github.com/Jermolene/TiddlyWiki5/issues/5669
 * @param originalUrl might be `"http://0.0.0.0:5212/"`
 */
export async function getLocalHostUrlWithActualIP(originalUrl: string): Promise<string> {
  const internalIp = await internalIpV4();
  const localHostUrlWithActualIP = originalUrl.replace(/((?:\d{1,3}\.){3}\d{1,3}|localhost)/, internalIp ?? defaultServerIP);
  logger.debug(
    `Current available address: address() returns ${internalIp ?? 'undefined'}
    originalUrl: ${originalUrl} , localHostUrlWithActualIP ${localHostUrlWithActualIP}`,
  );
  return localHostUrlWithActualIP;
}

/** Sometimes workspace port is corrupted, we want it be fixed to what user set in the workspace setting. */
export function replaceUrlPortWithSettingPort(originalUrl: string, newPort: number): string {
  const parsedUrl = new URL(originalUrl);
  parsedUrl.port = String(newPort);
  return parsedUrl.toString();
}
