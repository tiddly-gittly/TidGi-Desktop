/* eslint-disable n/no-callback-literal */
import { session } from 'electron';

import { getTidGiAuthHeaderWithToken, TIDGI_AUTH_TOKEN_HEADER } from '@/constants/auth';
import { isMac } from '@/helpers/system';
import { IAuthenticationService } from '@services/auth/interface';
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import { IPreferences } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWorkspace } from '@services/workspaces/interface';

interface IViewSessionContext {
  userName: string;
}

export function setupViewSession(workspace: IWorkspace, preferences: IPreferences, viewContext: IViewSessionContext) {
  const { shareWorkspaceBrowsingData, spellcheck, spellcheckLanguages } = preferences;
  const authService = container.get<IAuthenticationService>(serviceIdentifier.Authentication);

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
    assignAdminAuthToken(workspace.id, details, authService, viewContext);
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });
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

/**
 * Work with tokenAuthenticateArguments in wikiWorker, see there for detail.
 */
function assignAdminAuthToken(workspaceID: string, details: Electron.OnBeforeSendHeadersListenerDetails, authService: IAuthenticationService, viewContext: IViewSessionContext) {
  const adminToken = authService.getOneTimeAdminAuthTokenForWorkspaceSync(workspaceID);
  if (adminToken === undefined) {
    logger.error(`adminToken is undefined for ${workspaceID}, this should not happen. Skip adding ${TIDGI_AUTH_TOKEN_HEADER}-xxx header for it.`);
    return;
  }
  details.requestHeaders[getTidGiAuthHeaderWithToken(adminToken)] = viewContext.userName;
}
