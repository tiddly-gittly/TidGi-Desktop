import { getAllLocalIpV4 } from '@/helpers/ip';
import type { IWorkspace } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';
import { logger } from './log';

/**
 * get wiki address with local machine ip, so QR code will be correct, instead of get `0.0.0.0`
 * https://github.com/Jermolene/TiddlyWiki5/issues/5669
 * @param originalUrl might be `"http://0.0.0.0:5212/"`
 */
export async function getLocalHostUrlWithActualIP(originalUrl: string): Promise<string> {
  const allIps = getAllLocalIpV4();
  const ip = allIps.length > 0 ? allIps[0] : 'localhost';
  return originalUrl.replace(/((?:\d{1,3}\.){3}\d{1,3}|localhost)/, ip);
}

/**
 * Replace 0.0.0.0/localhost in the original URL with ALL local (non-internal) IPv4 addresses.
 * Used to generate multiple QR codes for devices that have multiple network interfaces.
 * @param originalUrl might be `"http://0.0.0.0:5212/"`
 * @returns Array of URLs with real IPs, e.g. `["http://192.168.1.100:5212/", "http://10.0.0.5:5212/"]`
 */
export function getAllLocalHostUrlsWithActualIP(originalUrl: string): string[] {
  const allIps = getAllLocalIpV4();
  if (allIps.length === 0) {
    // Fallback: no real IP found, return localhost
    return [originalUrl.replace(/((?:\d{1,3}\.){3}\d{1,3}|localhost)/, 'localhost')];
  }
  return allIps.map(ip => originalUrl.replace(/((?:\d{1,3}\.){3}\d{1,3}|localhost)/, ip));
}

export function getUrlWithCorrectProtocol(workspace: IWorkspace, originalUrl: string): string {
  const isHttps = isWikiWorkspace(workspace) && Boolean(workspace.https?.enabled && workspace.https.tlsKey && workspace.https.tlsCert);
  try {
    const parsedUrl = new URL(originalUrl);
    if (isHttps) {
      parsedUrl.protocol = 'https';
    } else {
      parsedUrl.protocol = 'http';
    }
    return parsedUrl.toString();
  } catch (error) {
    logger.error(
      'Failed to getUrlWithCorrectProtocol for originalUrl, fallback to originalUrl',
      { isHttps, error },
    );
    return originalUrl;
  }
}

/** Sometimes workspace port is corrupted, we want it be fixed to what user set in the workspace setting. */
export function replaceUrlPortWithSettingPort(originalUrl: string, newPort: number): string {
  try {
    // maybe TypeError: Invalid URL
    const parsedUrl = new URL(originalUrl);
    parsedUrl.port = String(newPort);
    return parsedUrl.toString();
  } catch (error) {
    const error_ = error as Error;
    logger.error(
      'Failed to replaceUrlPortWithSettingPort for originalUrl, fallback to originalUrl',
      { error: error_ },
    );
    return originalUrl;
  }
}

export function isSameOrigin(a: string, b?: string | null): boolean {
  if (b === undefined || b === null) return false;
  try {
    const urlA = new URL(a);
    const urlB = new URL(b);
    return urlA.origin === urlB.origin;
  } catch {
    return false;
  }
}
