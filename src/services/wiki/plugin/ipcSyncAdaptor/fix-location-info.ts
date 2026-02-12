import { getTidGiAuthHeaderWithToken } from '@/constants/auth';
import { getDefaultHTTPServerIP } from '@/constants/urls';
import type { WindowMeta, WindowNames } from '@services/windows/WindowProperties';
import { isWikiWorkspace } from '@services/workspaces/interface';

type TidGiServiceCandidate = (typeof window.service) | undefined;

function getTidGiService(): Exclude<TidGiServiceCandidate, undefined> | undefined {
  const twWithExtensions = $tw as typeof $tw & {
    tidgi?: { service?: TidGiServiceCandidate };
  };
  const service = twWithExtensions.tidgi?.service ?? window.service;
  if (service === undefined) {
    return undefined;
  }

  twWithExtensions.tidgi = twWithExtensions.tidgi ?? {};
  twWithExtensions.tidgi.service = twWithExtensions.tidgi.service ?? service;

  return service;
}

function getInfoTiddlerFields(updateInfoTiddlersCallback: (infos: Array<{ text: string; title: string }>) => void) {
  const mapBoolean = function(value: boolean) {
    return value ? 'yes' : 'no';
  };
  const infoTiddlerFields: Array<{ text: string; title: string }> = [];
  // Basics
  if (!$tw.browser || typeof window === 'undefined') return infoTiddlerFields;
  const isInTidGi = typeof document !== 'undefined' && document.location.protocol.startsWith('tidgi');
  const workspace = (typeof window.meta === 'function' ? window.meta() as WindowMeta[WindowNames.view] : undefined)?.workspace;
  const workspaceID = workspace?.id;
  infoTiddlerFields.push({ title: '$:/info/tidgi', text: mapBoolean(isInTidGi) });
  if (isInTidGi && workspaceID) {
    infoTiddlerFields.push({ title: '$:/info/tidgi/workspaceID', text: workspaceID });
    const tidgiService = getTidGiService();

    if (tidgiService === undefined) {
      console.warn('TidGi service is not available yet when getting location info tiddler fields.', { function: 'getInfoTiddlerFields' });
      return infoTiddlerFields;
    }
    /**
     * Push to asyncInfoTiddlerFields in this async function
     */
    void tidgiService.workspace.get(workspaceID).then(async (workspace) => {
      if (workspace === undefined) return;

      // Only wiki workspaces have these properties
      if (!isWikiWorkspace(workspace)) return;

      const {
        https = { enabled: false },
        port,
        enableHTTPAPI,
        tokenAuth,
        authToken,
        userName,
        name: workspaceName,
      } = workspace;
      const asyncInfoTiddlerFields: Array<{ text: string; title: string }> = [];
      const setLocationProperty = function(name: string, value: string) {
        asyncInfoTiddlerFields.push({ title: '$:/info/url/' + name, text: value });
      };
      const localHostUrl = await tidgiService.native.getLocalHostUrlWithActualInfo(getDefaultHTTPServerIP(port), workspaceID);
      const urlObject = new URL(localHostUrl);
      setLocationProperty('full', (localHostUrl).split('#')[0]);
      setLocationProperty('host', urlObject.host);
      setLocationProperty('hostname', urlObject.hostname);
      setLocationProperty('protocol', https ? 'https' : 'http');
      setLocationProperty('port', urlObject.port);
      setLocationProperty('pathname', urlObject.pathname);
      setLocationProperty('search', urlObject.search);
      setLocationProperty('origin', urlObject.origin);

      asyncInfoTiddlerFields.push({ title: '$:/info/tidgi/tokenAuth', text: mapBoolean(tokenAuth) }, { title: '$:/info/tidgi/enableHTTPAPI', text: mapBoolean(enableHTTPAPI) });

      // Add workspace name for QR code
      if (workspaceName) {
        asyncInfoTiddlerFields.push({ title: '$:/info/tidgi/workspaceName', text: workspaceName });
      }

      // Add workspace token for QR code (if available)
      if (authToken) {
        asyncInfoTiddlerFields.push({ title: '$:/info/tidgi/workspaceToken', text: authToken });
      }

      if (tokenAuth) {
        const fallbackUserName = await tidgiService.auth.get('userName');
        const tokenAuthHeader = `"${getTidGiAuthHeaderWithToken(authToken ?? '')}": "${userName || fallbackUserName || ''}"`;
        asyncInfoTiddlerFields.push({ title: '$:/info/tidgi/tokenAuthHeader', text: tokenAuthHeader });
      }
      updateInfoTiddlersCallback(asyncInfoTiddlerFields);
    });
  }
  return infoTiddlerFields;
}

declare const exports: Record<string, unknown>;
exports.getInfoTiddlerFields = getInfoTiddlerFields;
