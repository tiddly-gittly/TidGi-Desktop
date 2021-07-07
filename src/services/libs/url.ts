import { address } from 'ip';
import { defaultServerIP } from '@/constants/urls';
import { logger } from './log';

/**
 * get wiki address with local machine ip, so QR code will be correct, instead of get `0.0.0.0`
 * https://github.com/Jermolene/TiddlyWiki5/issues/5669
 * @param originalUrl might be `"http://0.0.0.0:5212/"`
 */
export function getLocalHostUrlWithActualIP(originalUrl: string): string {
  const localHostUrlWithActualIP = originalUrl.replace(/(?:\d{1,3}\.){3}\d{1,3}/, address('public') ?? defaultServerIP);
  logger.debug(
    `Current available address: address() returns ${address('public') ?? 'undefined'}
    originalUrl: ${originalUrl} , localHostUrlWithActualIP ${localHostUrlWithActualIP}`,
  );
  return localHostUrlWithActualIP;
}
