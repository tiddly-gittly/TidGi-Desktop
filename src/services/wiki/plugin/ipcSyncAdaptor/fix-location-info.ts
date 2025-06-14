import { getTidGiAuthHeaderWithToken } from '@/constants/auth';
import { getDefaultHTTPServerIP } from '@/constants/urls';
import { isWikiWorkspace } from '@services/workspaces/interface';
import type { WindowMeta, WindowNames } from '@services/windows/WindowProperties';

function getInfoTiddlerFields(updateInfoTiddlersCallback: (infos: Array<{ text: string; title: string }>) => void) {
  const mapBoolean = function(value: boolean) {
    return value ? 'yes' : 'no';
  };
  const infoTiddlerFields: Array<{ text: string; title: string }> = [];
  // Basics
  if (!$tw.browser || typeof window === 'undefined') return infoTiddlerFields;
  const isInTidGi = typeof document !== 'undefined' && document.location.protocol.startsWith('tidgi');
  const workspaceID = (window.meta() as WindowMeta[WindowNames.view] | undefined)?.workspaceID;
  infoTiddlerFields.push({ title: '$:/info/tidgi', text: mapBoolean(isInTidGi) });
  if (isInTidGi && workspaceID) {
    infoTiddlerFields.push({ title: '$:/info/tidgi/workspaceID', text: workspaceID });
    /**
     * Push to asyncInfoTiddlerFields in this async function
     */
    void window.service.workspace.get(workspaceID).then(async (workspace) => {
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
      } = workspace;
      const asyncInfoTiddlerFields: Array<{ text: string; title: string }> = [];
      const setLocationProperty = function(name: string, value: string) {
        asyncInfoTiddlerFields.push({ title: '$:/info/url/' + name, text: value });
      };
      const localHostUrl = await window.service.native.getLocalHostUrlWithActualInfo(getDefaultHTTPServerIP(port), workspaceID);
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
      if (tokenAuth) {
        const fallbackUserName = await window.service.auth.get('userName');
        const tokenAuthHeader = `"${getTidGiAuthHeaderWithToken(authToken ?? '')}": "${userName || fallbackUserName || ''}"`;
        asyncInfoTiddlerFields.push({ title: '$:/info/tidgi/tokenAuthHeader', text: tokenAuthHeader });
      }
      updateInfoTiddlersCallback(asyncInfoTiddlerFields);
    });
  }
  return infoTiddlerFields;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
exports.getInfoTiddlerFields = getInfoTiddlerFields;
