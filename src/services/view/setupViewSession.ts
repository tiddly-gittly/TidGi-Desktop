/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable n/no-callback-literal */
import { session } from 'electron';

import { isMac } from '@/helpers/system';
import { IPreferences } from '@services/preferences/interface';
import { IWorkspace } from '@services/workspaces/interface';

export function setupViewSession(workspace: IWorkspace, preferences: IPreferences, getPreferences: () => IPreferences) {
  const { shareWorkspaceBrowsingData, spellcheck, spellcheckLanguages } = preferences;

  // configure session, proxy & ad blocker
  const partitionId = shareWorkspaceBrowsingData ? 'persist:shared' : `persist:${workspace.id}`;
  // prepare configs for start a WebContentsView that loads wiki's web content
  // session
  const sessionOfView = session.fromPartition(partitionId);
  // spellchecker
  if (spellcheck && !isMac) {
    sessionOfView.setSpellCheckerLanguages(spellcheckLanguages);
  }

  sessionOfView.webRequest.onBeforeSendHeaders((details, callback) => {
    // We assign a fake user agent to the request, so the image site won't block request from inside wiki.
    assignFakeUserAgent(details, getPreferences);
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });

  return sessionOfView;
}

const FAKE_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36';
// pretending we are sending request from same origin using a Chrome browser. So image site won't block our request.
function assignFakeUserAgent(details: Electron.OnBeforeSendHeadersListenerDetails, getPreferences: () => IPreferences) {
  // get latest prefrences to allow hot reload of this feature
  const preferences = getPreferences();
  if (preferences.disableAntiAntiLeech) {
    return;
  }
  if (!details.url.startsWith('http')) {
    return;
  }
  // When request is from wiki BrowserView, which is loading with tidgi:// protocol, and use ipc-syncadaptor to load content.
  if (!(!details.frame?.url || details.frame?.url.startsWith('tidgi://'))) {
    return;
  }
  const url = new URL(details.url);
  if (preferences.disableAntiAntiLeechForUrls?.length > 0 && preferences.disableAntiAntiLeechForUrls.some(line => details.url.includes(line))) {
    return;
  }
  details.requestHeaders.Origin = url.origin;
  details.requestHeaders.Referer = details.url;
  details.requestHeaders['User-Agent'] = FAKE_USER_AGENT;
}
