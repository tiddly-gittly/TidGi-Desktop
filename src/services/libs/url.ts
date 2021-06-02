import { address } from 'ip';

import { defaultServerIP } from '@/constants/urls';

/**
 * get wiki address with local machine ip, so QR code will be correct, instead of get `0.0.0.0`
 * https://github.com/Jermolene/TiddlyWiki5/issues/5669
 * @param originalUrl might be `"http://0.0.0.0:5212/"`
 */
export function getLocalHostUrlWithActualIP(originalUrl: string): string {
  return originalUrl.replace(defaultServerIP, address());
}
