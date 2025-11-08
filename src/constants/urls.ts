/**
 * server start on this ip can be access by other devices under the same wifi
 */
export const defaultServerIP = '0.0.0.0';
export const latestStableUpdateUrl = 'https://github.com/tiddly-gittly/TidGi-Desktop/releases/latest';
export const githubDesktopUrl = 'https://desktop.github.com/';
/** https://tiddlywiki.com/#SafeMode
 * This is currently unused, because it always entering /#safe:safe , very annoying. And even entered, the url can still not containing this. So I decided not support enter/quit safe mode now.
 */
export const safeModeHash = '#:safe';
export const getDefaultHTTPServerIP = (port: number) => `http://${defaultServerIP}:${port}`;
export const getDefaultTidGiUrl = (workspaceID: string) => `tidgi://${workspaceID}`;
export const getTiddlerTidGiUrl = (workspaceID: string, tiddlerTitle: string) => `${getDefaultTidGiUrl(workspaceID)}/${tiddlerTitle}`;
const tidGiUrlRegex = /^tidgi:\/\/([\da-f-]+)\/([\da-f-]+)$/i;
export const getInfoFromTidGiUrl = (tidGiUrl: string) => {
  const match = tidGiUrl.match(tidGiUrlRegex);
  if (match !== null) {
    const workspaceID = match[1];
    const tiddlerTitle = match[2];
    return { workspaceID, tiddlerTitle };
  }
  return { workspaceID: '', tiddlerTitle: '' };
};

/**
 * Extract workspace ID from tidgi:// protocol URL (used in WebContents)
 * @param url The URL to extract workspace ID from
 * @returns The workspace ID or undefined if not a valid tidgi:// URL
 * @example
 * ```ts
 * getWorkspaceIdFromUrl('tidgi://workspace-123') // 'workspace-123'
 * getWorkspaceIdFromUrl('tidgi://workspace-123/SomeTiddler') // 'workspace-123'
 * getWorkspaceIdFromUrl('http://localhost:3000/wiki/123/') // undefined
 * ```
 */
export function getWorkspaceIdFromUrl(url: string): string | undefined {
  // Match tidgi://workspace-id or tidgi://workspace-id/path
  const match = url.match(/^tidgi:\/\/([^/]+)/);
  return match?.[1];
}
