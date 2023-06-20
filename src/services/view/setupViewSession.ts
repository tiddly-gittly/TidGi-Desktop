/* eslint-disable n/no-callback-literal */
import { session } from 'electron';

import { isMac } from '@/helpers/system';
import { container } from '@services/container';
import { INativeService } from '@services/native/interface';
import { IPreferences } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWorkspace } from '@services/workspaces/interface';

export function setupViewSession(workspace: IWorkspace, preferences: IPreferences) {
  const { shareWorkspaceBrowsingData, spellcheck, spellcheckLanguages } = preferences;
  const nativeService = container.get<INativeService>(serviceIdentifier.NativeService);

  // configure session, proxy & ad blocker
  const partitionId = shareWorkspaceBrowsingData ? 'persist:shared' : `persist:${workspace.id}`;
  // prepare configs for start a BrowserView that loads wiki's web content
  // session
  const sessionOfView = session.fromPartition(partitionId);
  // spellchecker
  if (spellcheck && !isMac) {
    sessionOfView.setSpellCheckerLanguages(spellcheckLanguages);
  }
  sessionOfView.webRequest.onBeforeSendHeaders((details, callback) => {
    assignFakeUserAgent(details);
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });
  sessionOfView.webRequest.onBeforeRequest((details, callback) => {
    if (details.url.startsWith('file://') || details.url.startsWith('open://')) {
      void handleFileLink(details, nativeService, callback);
    } else {
      callback({
        cancel: false,
      });
    }
  });
  handleFileProtocol(sessionOfView, nativeService);
  return sessionOfView;
}

const FAKE_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36';
// pretending we are sending request from same origin using a Chrome browser. So image site won't block our request.
function assignFakeUserAgent(details: Electron.OnBeforeSendHeadersListenerDetails) {
  const url = new URL(details.url);
  details.requestHeaders.Origin = url.origin;
  details.requestHeaders.Referer = details.url;
  details.requestHeaders['User-Agent'] = FAKE_USER_AGENT;
}

function handleFileProtocol(sessionOfView: Electron.Session, nativeService: INativeService) {
  // this normally nor called. In wiki file:// image will use `handleFileLink()` below.
  sessionOfView.protocol.registerFileProtocol('file', nativeService.handleFileProtocol.bind(nativeService));
}

async function handleFileLink(details: Electron.OnBeforeRequestListenerDetails, nativeService: INativeService, callback: (response: Electron.CallbackResponse) => void) {
  await nativeService.handleFileProtocol({ url: details.url }, (redirectURL: string) => {
    if (redirectURL === details.url) {
      callback({
        cancel: false,
      });
    } else {
      callback({
        cancel: false,
        redirectURL,
      });
    }
  });
}
