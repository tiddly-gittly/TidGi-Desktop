/* eslint-disable @typescript-eslint/strict-boolean-expressions */

import { getDefaultHTTPServerIP } from '@/constants/urls';
import type { WindowMeta, WindowNames } from '@services/windows/WindowProperties';

function getInfoTiddlerFields(updateInfoTiddlersCallback: (infos: Array<{ text: string; title: string }>) => void) {
  const mapBoolean = function(value: boolean) {
    return value ? 'yes' : 'no';
  };
  const infoTiddlerFields: Array<{ text: string; title: string }> = [];
  // Basics
  if (!$tw.browser || typeof window === 'undefined') return infoTiddlerFields;
  const isInTidGi = typeof document !== 'undefined' && document?.location?.protocol?.startsWith('tidgi');
  const workspaceID = (window.meta as WindowMeta[WindowNames.view] | undefined)?.workspaceID;
  infoTiddlerFields.push({ title: '$:/info/tidgi', text: mapBoolean(isInTidGi) });
  if (isInTidGi && workspaceID) {
    infoTiddlerFields.push({ title: '$:/info/tidgi-workspace-id', text: workspaceID });
    void window.service.workspace.get(workspaceID).then(async (workspace) => {
      if (workspace === undefined) return;
      const asyncInfoTiddlerFields: Array<{ text: string; title: string }> = [];
      const setLocationProperty = function(name: string, value: string) {
        asyncInfoTiddlerFields.push({ title: '$:/info/url/' + name, text: value });
      };
      const localHostUrl = await window.service.native.getLocalHostUrlWithActualInfo(getDefaultHTTPServerIP(workspace.port), workspaceID);
      const urlObject = new URL(localHostUrl);
      setLocationProperty('full', (localHostUrl).split('#')[0]);
      setLocationProperty('host', urlObject.host);
      setLocationProperty('hostname', urlObject.hostname);
      setLocationProperty('protocol', workspace.https ? 'https' : 'http');
      setLocationProperty('port', urlObject.port);
      setLocationProperty('pathname', urlObject.pathname);
      setLocationProperty('search', urlObject.search);
      setLocationProperty('origin', urlObject.origin);
      updateInfoTiddlersCallback(asyncInfoTiddlerFields);
    });
  }
  return infoTiddlerFields;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
exports.getInfoTiddlerFields = getInfoTiddlerFields;
