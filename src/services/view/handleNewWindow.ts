import { BrowserView, BrowserWindowConstructorOptions, shell } from 'electron';
import windowStateKeeper from 'electron-window-state';

import { SETTINGS_FOLDER } from '@/constants/appPaths';
import { MetaDataChannel } from '@/constants/channels';
import { extractDomain, isInternalUrl } from '@/helpers/url';
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import { IMenuService } from '@services/menu/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { IBrowserViewMetaData, windowDimension, WindowNames } from '@services/windows/WindowProperties';
import { IWorkspace, IWorkspaceService } from '@services/workspaces/interface';
import { INewWindowAction } from './interface';
import { IViewMeta } from './setupViewEventHandlers';
import { handleOpenFileExternalLink } from './setupViewFileProtocol';

export interface INewWindowContext {
  meta: IViewMeta;
  sharedWebPreferences: BrowserWindowConstructorOptions['webPreferences'];
  view: BrowserView;
  workspace: IWorkspace;
}

export function handleNewWindow(
  nextUrl: string,
  newWindowContext: INewWindowContext,
  disposition: 'default' | 'new-window' | 'foreground-tab' | 'background-tab' | 'save-to-disk' | 'other',
  parentWebContents: Electron.WebContents,
): INewWindowAction {
  logger.debug(`Getting url that will open externally`, { nextUrl });
  // don't show useless blank page
  if (nextUrl.startsWith('about:blank')) {
    logger.debug('ignore about:blank');
    return { action: 'deny' };
  }
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);

  const nextDomain = extractDomain(nextUrl);
  const handleOpenFileExternalLinkAction = handleOpenFileExternalLink(nextUrl, newWindowContext);
  if (handleOpenFileExternalLinkAction !== undefined) return handleOpenFileExternalLinkAction;
  // open external url in browser
  if (nextDomain !== undefined && (disposition === 'foreground-tab' || disposition === 'background-tab')) {
    logger.debug('handleNewWindow() openExternal', { nextUrl, nextDomain, disposition });
    void shell.openExternal(nextUrl).catch((error) => logger.error(`handleNewWindow() openExternal error ${(error as Error).message}`, error));
    return {
      action: 'deny',
    };
  }
  logger.debug('handleNewWindow()', { newWindowContext });
  const { view, workspace, sharedWebPreferences, meta } = newWindowContext;
  const currentUrl = view.webContents.getURL();
  /** Conditions are listed by order of priority
  if global.forceNewWindow = true
  or regular new-window event
  or if in Google Drive app, open Google Docs files internally https://github.com/atomery/webcatalog/issues/800
  the next external link request will be opened in new window */
  const clickOpenNewWindow = meta.forceNewWindow || disposition === 'new-window' || disposition === 'default';
  /** App tries to open external link using JS
  nextURL === 'about:blank' but then window will redirect to the external URL
  https://github.com/quanglam2807/webcatalog/issues/467#issuecomment-569857721 */
  const isExternalLinkUsingJS = nextDomain === null && (disposition === 'foreground-tab' || disposition === 'background-tab');
  if (clickOpenNewWindow || isExternalLinkUsingJS) {
    // https://gist.github.com/Gvozd/2cec0c8c510a707854e439fb15c561b0
    // if 'new-window' is triggered with Cmd+Click
    // options is undefined
    // https://github.com/atomery/webcatalog/issues/842
    const browserViewMetaData: IBrowserViewMetaData = {
      isPopup: true,
      ...(JSON.parse(
        decodeURIComponent(sharedWebPreferences?.additionalArguments?.[1]?.replace(MetaDataChannel.browserViewMetaData, '') ?? '{}'),
      ) as IBrowserViewMetaData),
    };
    logger.debug(`handleNewWindow() ${meta.forceNewWindow ? 'forceNewWindow' : 'disposition'}`, {
      browserViewMetaData,
      disposition,
      nextUrl,
      nextDomain,
    });
    meta.forceNewWindow = false;
    const metadataConfig = {
      additionalArguments: [
        `${MetaDataChannel.browserViewMetaData}${WindowNames.newWindow}`,
        `${MetaDataChannel.browserViewMetaData}${encodeURIComponent(JSON.stringify(browserViewMetaData))}`,
      ],
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    };
    const windowWithBrowserViewState = windowStateKeeper({
      file: 'window-state-open-in-new-window.json',
      path: SETTINGS_FOLDER,
      defaultWidth: windowDimension[WindowNames.main].width,
      defaultHeight: windowDimension[WindowNames.main].height,
    });
    let newOptions: BrowserWindowConstructorOptions = {
      x: windowWithBrowserViewState.x,
      y: windowWithBrowserViewState.y,
      width: windowWithBrowserViewState.width,
      height: windowWithBrowserViewState.height,
      webPreferences: metadataConfig,
      autoHideMenuBar: true,
    };

    if (isExternalLinkUsingJS) {
      newOptions = { ...newOptions, show: false };
    }
    parentWebContents.once('did-create-window', (childWindow) => {
      childWindow.setMenuBarVisibility(false);
      childWindow.webContents.setWindowOpenHandler((details: Electron.HandlerDetails) => handleNewWindow(details.url, newWindowContext, details.disposition, parentWebContents));
      childWindow.webContents.once('will-navigate', async (_event, url) => {
        // if the window is used for the current app, then use default behavior
        const appUrl = (await workspaceService.get(workspace.id))?.homeUrl;
        if (appUrl === undefined) {
          throw new Error(`Workspace ${workspace.id} not existed, or don't have homeUrl setting`);
        }
        if (isInternalUrl(url, [appUrl, currentUrl])) {
          childWindow.show();
        } else {
          // if not, open in browser
          _event.preventDefault();
          void shell.openExternal(url);
          childWindow.close();
        }
      });
      windowWithBrowserViewState.manage(childWindow);
      const menuService = container.get<IMenuService>(serviceIdentifier.MenuService);
      void menuService.initContextMenuForWindowWebContents(view.webContents).then((unregisterContextMenu) => {
        childWindow.webContents.on('destroyed', () => {
          unregisterContextMenu();
        });
      });
    });
    return {
      action: 'allow',
      overrideBrowserWindowOptions: newOptions,
    };
  }

  return { action: 'allow' };
}
