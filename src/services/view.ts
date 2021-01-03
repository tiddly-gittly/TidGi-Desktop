import {
  BrowserView,
  BrowserWindow,
  WebContents,
  app,
  session,
  shell,
  dialog,
  ipcMain,
  Event as ElectronEvent,
  BrowserWindowConstructorOptions,
} from 'electron';
import { injectable, inject } from 'inversify';
import path from 'path';
import fsExtra from 'fs-extra';

import serviceIdentifiers from '@services/serviceIdentifier';
import { Preference } from '@services/preferences';
import { Workspace } from '@services/workspaces';
import { buildResourcePath } from '@/services/constants/paths';
import i18n from './libs/i18n';
import wikiStartup from './libs/wiki/wiki-startup';
import sendToAllWindows from './libs/send-to-all-windows';
import getViewBounds from './libs/get-view-bounds';
import { extractDomain, isInternalUrl } from '@/services/libs/url';
import { IWorkspace } from '@/services/types';

declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

@injectable()
export class View {
  constructor(
    @inject(serviceIdentifiers.Preference) private readonly preferenceService: Preference,
    @inject(serviceIdentifiers.Workspace) private readonly workspaceService: Workspace,
  ) {}

  private views: Record<string, BrowserView> = {};
  private shouldMuteAudio = false;
  private shouldPauseNotifications = false;

  public async addView(browserWindow: BrowserWindow, workspace: IWorkspace): Promise<void> {
    if (this.views[workspace.id] !== undefined) {
      return;
    }
    if (workspace.isSubWiki) {
      return;
    }
    const {
      customUserAgent,
      proxyBypassRules,
      proxyPacScript,
      proxyRules,
      proxyType,
      rememberLastPageVisited,
      shareWorkspaceBrowsingData,
      spellcheck,
      spellcheckLanguages,
      unreadCountBadge,
    } = this.preferenceService.getPreferences();
    // configure session, proxy & ad blocker
    const partitionId = shareWorkspaceBrowsingData ? 'persist:shared' : `persist:${workspace.id}`;
    // FIXME: call auth service instead
    const userInfo = this.preferenceService.get('github-user-info');
    if (userInfo !== undefined) {
      // user not logined into Github
      void dialog.showMessageBox(browserWindow, {
        title: i18n.t('Dialog.GithubUserInfoNoFound'),
        message: i18n.t('Dialog.GithubUserInfoNoFoundDetail'),
        buttons: ['OK'],
        cancelId: 0,
        defaultId: 0,
      });
    }
    // session
    const sessionOfView = session.fromPartition(partitionId);
    // proxy
    if (proxyType === 'rules') {
      await sessionOfView.setProxy({
        proxyRules,
        proxyBypassRules,
      });
    } else if (proxyType === 'pacScript') {
      await sessionOfView.setProxy({
        // @ts-expect-error ts-migrate(2345) FIXME: Argument of type '{ proxyPacScript: any; proxyBypa... Remove this comment to see the full error message
        proxyPacScript,
        proxyBypassRules,
      });
    }
    // spellchecker
    if (spellcheck && process.platform !== 'darwin') {
      sessionOfView.setSpellCheckerLanguages(spellcheckLanguages);
    }
    const sharedWebPreferences = {
      spellcheck,
      nativeWindowOpen: true,
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: true,
      session: sessionOfView,
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    };
    const view = new BrowserView({
      webPreferences: sharedWebPreferences,
    });
    // FIXME: put this into meta when creating window
    (view.webContents as any).workspaceId = workspace.id;
    // background needs to explicitly set
    // if not, by default, the background of BrowserView is transparent
    // which would break the CSS of certain websites
    // even with dark mode, all major browsers
    // always use #FFF as default page background
    // https://github.com/atomery/webcatalog/issues/723
    // https://github.com/electron/electron/issues/16212
    view.setBackgroundColor('#FFF');

    /**
     * Side effect, update contents.userAgent
     * @param _contents webContent to set userAgent
     * @param _url
     */
    let adjustUserAgentByUrl = (_contents: WebContents, _url: string): boolean => false;
    if (typeof customUserAgent === 'string' && customUserAgent.length > 0) {
      view.webContents.userAgent = customUserAgent;
    } else {
      // Hide Electron from UA to improve compatibility
      // https://github.com/quanglam2807/webcatalog/issues/182
      const uaString = view.webContents.userAgent;
      const commonUaString = uaString
        // Fix WhatsApp requires Google Chrome 49+ bug
        .replace(` ${app.name}/${app.getVersion()}`, '')
        // Hide Electron from UA to improve compatibility
        // https://github.com/quanglam2807/webcatalog/issues/182
        .replace(` Electron/${process.versions.electron}`, '');
      view.webContents.userAgent = commonUaString;
      // fix Google prevents signing in because of security concerns
      // https://github.com/quanglam2807/webcatalog/issues/455
      // https://github.com/meetfranz/franz/issues/1720#issuecomment-566460763
      const fakedEdgeUaString = `${commonUaString} Edge/18.18875`;
      adjustUserAgentByUrl = (contents: WebContents, url: string): boolean => {
        if (typeof customUserAgent === 'string' && customUserAgent.length > 0) {
          return false;
        }
        const navigatedDomain = extractDomain(url);
        const currentUaString = contents.userAgent;
        if (navigatedDomain === 'accounts.google.com') {
          if (currentUaString !== fakedEdgeUaString) {
            contents.userAgent = fakedEdgeUaString;
            return true;
          }
        } else if (currentUaString !== commonUaString) {
          contents.userAgent = commonUaString;
          return true;
        }
        return false;
      };
    }
    view.webContents.on('will-navigate', (event, nextUrl) => {
      // open external links in browser
      // https://github.com/atomery/webcatalog/issues/849#issuecomment-629587264
      // this behavior is likely to break many apps (eg Microsoft Teams)
      // apply this rule only to github.com for now
      const appUrl = this.workspaceService.get(workspace.id)?.homeUrl;
      const currentUrl = view.webContents.getURL();
      if (appUrl !== undefined) {
        const appDomain = extractDomain(appUrl);
        const currentDomain = extractDomain(currentUrl);
        if (
          appDomain !== undefined &&
          currentDomain !== undefined &&
          (appDomain.includes('github.com') || currentDomain.includes('github.com')) &&
          !isInternalUrl(nextUrl, [appUrl, currentUrl])
        ) {
          event.preventDefault();
          void shell.openExternal(nextUrl);
        }
        adjustUserAgentByUrl(view.webContents, nextUrl);
      }
    });
    view.webContents.on('did-start-loading', () => {
      const workspaceObject = this.workspaceService.get(workspace.id);
      // this event might be triggered
      // even after the workspace obj and BrowserView
      // are destroyed. See https://github.com/atomery/webcatalog/issues/836
      if (workspaceObject === undefined) {
        return;
      }
      if (workspaceObject.active) {
        if (typeof this.workspaceService.getMetaData(workspace.id).didFailLoadErrorMessage === 'string') {
          // show browserView again when reloading after error
          // see did-fail-load event
          if (browserWindow !== undefined && !browserWindow.isDestroyed()) {
            // fix https://github.com/atomery/singlebox/issues/228
            const contentSize = browserWindow.getContentSize();
            // @ts-expect-error ts-migrate(2554) FIXME: Expected 4 arguments, but got 1.
            view.setBounds(getViewBounds(contentSize));
          }
        }
      }
      this.workspaceService.updateMetaData(workspace.id, {
        // eslint-disable-next-line unicorn/no-null
        didFailLoadErrorMessage: null,
        isLoading: true,
      });
    });
    view.webContents.on('did-stop-loading', () => {
      const workspaceObject = this.workspaceService.get(workspace.id);
      // this event might be triggered
      // even after the workspace obj and BrowserView
      // are destroyed. See https://github.com/atomery/webcatalog/issues/836
      if (workspaceObject === undefined) {
        return;
      }
      // isLoading is now controlled by wiki-worker-manager.js
      // this.workspaceService.updateMetaData(workspace.id, {
      //   isLoading: false,
      // });
      if (workspaceObject.active) {
        sendToAllWindows('update-address', view.webContents.getURL(), false);
      }
      const currentUrl = view.webContents.getURL();
      void this.workspaceService.update(workspace.id, {
        lastUrl: currentUrl,
      });
      // fix https://github.com/atomery/webcatalog/issues/870
      ipcMain.emit('request-realign-active-workspace');
    });
    // focus on initial load
    // https://github.com/atomery/webcatalog/issues/398
    if (workspace.active) {
      view.webContents.once('did-stop-loading', () => {
        if (browserWindow.isFocused() && !view.webContents.isFocused()) {
          view.webContents.focus();
        }
      });
    }
    // https://electronjs.org/docs/api/web-contents#event-did-fail-load
    view.webContents.on('did-fail-load', (_event, errorCode, errorDesc, _validateUrl, isMainFrame) => {
      const workspaceObject = this.workspaceService.get(workspace.id);
      // this event might be triggered
      // even after the workspace obj and BrowserView
      // are destroyed. See https://github.com/atomery/webcatalog/issues/836
      if (workspaceObject === undefined) {
        return;
      }
      if (isMainFrame && errorCode < 0 && errorCode !== -3) {
        this.workspaceService.updateMetaData(workspace.id, {
          didFailLoadErrorMessage: errorDesc,
        });
        if (workspaceObject.active) {
          if (browserWindow !== undefined && !browserWindow.isDestroyed()) {
            // fix https://github.com/atomery/singlebox/issues/228
            const contentSize = browserWindow.getContentSize();
            view.setBounds(getViewBounds(contentSize as [number, number], false, 0, 0)); // hide browserView to show error message
          }
        }
      }
      // edge case to handle failed auth
      if (errorCode === -300 && view.webContents.getURL().length === 0) {
        void view.webContents.loadURL(workspaceObject.homeUrl);
      }
    });
    view.webContents.on('did-navigate', (_event, url) => {
      const workspaceObject = this.workspaceService.get(workspace.id);
      // this event might be triggered
      // even after the workspace obj and BrowserView
      // are destroyed. See https://github.com/atomery/webcatalog/issues/836
      if (workspaceObject === undefined) {
        return;
      }
      // fix "Google Chat isn't supported on your current browser"
      // https://github.com/atomery/webcatalog/issues/820
      if (typeof url === 'string' && url.includes('error/browser-not-supported') && url.startsWith('https://chat.google.com')) {
        const reference = new URL(url).searchParams.get('ref') ?? '';
        void view.webContents.loadURL(`https://chat.google.com${reference}`);
      }
      if (workspaceObject.active) {
        sendToAllWindows('update-can-go-back', view.webContents.canGoBack());
        sendToAllWindows('update-can-go-forward', view.webContents.canGoForward());
        sendToAllWindows('update-address', url, false);
      }
    });
    view.webContents.on('did-navigate-in-page', (_event, url) => {
      const workspaceObject = this.workspaceService.get(workspace.id);
      // this event might be triggered
      // even after the workspace obj and BrowserView
      // are destroyed. See https://github.com/atomery/webcatalog/issues/836
      if (workspaceObject === undefined) {
        return;
      }
      if (workspaceObject.active) {
        sendToAllWindows('update-can-go-back', view.webContents.canGoBack());
        sendToAllWindows('update-can-go-forward', view.webContents.canGoForward());
        sendToAllWindows('update-address', url, false);
      }
    });
    view.webContents.on('page-title-updated', (_event, title) => {
      const workspaceObject = this.workspaceService.get(workspace.id);
      // this event might be triggered
      // even after the workspace obj and BrowserView
      // are destroyed. See https://github.com/atomery/webcatalog/issues/836
      if (workspaceObject === undefined) {
        return;
      }
      if (workspaceObject.active) {
        sendToAllWindows('update-title', title);
        browserWindow.setTitle(title);
      }
    });
    const handleNewWindow = (
      event: ElectronEvent,
      nextUrl: string,
      _frameName: string,
      disposition: string,
      options?: BrowserWindowConstructorOptions,
    ): void => {
      const appUrl = this.workspaceService.get(workspace.id)?.homeUrl;
      if (appUrl === undefined) {
        throw new Error(`Workspace ${workspace.id} not existed, or don't have homeUrl setting`);
      }
      const appDomain = extractDomain(appUrl);
      const currentUrl = view.webContents.getURL();
      const currentDomain = extractDomain(currentUrl);
      const nextDomain = extractDomain(nextUrl);
      const openInNewWindow = (): void => {
        // https://gist.github.com/Gvozd/2cec0c8c510a707854e439fb15c561b0
        event.preventDefault();
        // if 'new-window' is triggered with Cmd+Click
        // options is undefined
        // https://github.com/atomery/webcatalog/issues/842
        const cmdClick = options === undefined;
        const newOptions = cmdClick
          ? {
              show: true,
              width: 1200,
              height: 800,
              webPreferences: sharedWebPreferences,
            }
          : { ...options, width: 1200, height: 800 };
        const popupWin = new BrowserWindow(newOptions);
        // FIXME: WebCatalog internal value to determine whether BrowserWindow is popup
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        (popupWin as any).isPopup = true;
        popupWin.setMenuBarVisibility(false);
        popupWin.webContents.on('new-window', handleNewWindow);
        // fix Google prevents signing in because of security concerns
        // https://github.com/atomery/webcatalog/issues/455
        // https://github.com/meetfranz/franz/issues/1720#issuecomment-566460763
        // will-navigate doesn't trigger for loadURL, goBack, goForward
        // so user agent to needed to be double check here
        // not the best solution as page will be unexpectedly reloaded
        // but it won't happen very often
        popupWin.webContents.on('will-navigate', (_navigateEvent, url) => {
          adjustUserAgentByUrl(popupWin.webContents, url);
        });
        popupWin.webContents.on('did-navigate', (_navigateEvent, url) => {
          if (adjustUserAgentByUrl(popupWin.webContents, url)) {
            popupWin.webContents.reload();
          }
        });
        // if 'new-window' is triggered with Cmd+Click
        // url is not loaded automatically
        // https://github.com/atomery/webcatalog/issues/842
        if (cmdClick) {
          void popupWin.loadURL(nextUrl);
        }
        // FIXME: type definition of event
        // @ts-expect-error Property 'newGuest' does not exist on type 'Event'.ts(2339)
        event.newGuest = popupWin;
      };
      // Conditions are listed by order of priority
      // if global.forceNewWindow = true
      // or regular new-window event
      // or if in Google Drive app, open Google Docs files internally https://github.com/atomery/webcatalog/issues/800
      // the next external link request will be opened in new window
      if (
        // FIXME: WebCatalog internal value to determine whether BrowserWindow is popup
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        (global as any).forceNewWindow === true ||
        disposition === 'new-window' ||
        disposition === 'default' ||
        (appDomain === 'drive.google.com' && nextDomain === 'docs.google.com')
      ) {
        (global as any).forceNewWindow = false;
        openInNewWindow();
        return;
      }
      // load in same window
      if (
        // Google: Add account
        nextDomain === 'accounts.google.com' ||
        // Google: Switch account
        (typeof nextDomain === 'string' &&
          nextDomain.indexOf('google.com') > 0 &&
          isInternalUrl(nextUrl, [appUrl, currentUrl]) &&
          (nextUrl.includes('authuser=') || // https://drive.google.com/drive/u/1/priority?authuser=2 (has authuser query)
            /\/u\/\d+\/{0,1}$/.test(nextUrl))) || // https://mail.google.com/mail/u/1/ (ends with /u/1/)
        // https://github.com/atomery/webcatalog/issues/315
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing
        ((appDomain?.includes('asana.com') || currentDomain?.includes('asana.com')) && nextDomain?.includes('asana.com'))
      ) {
        event.preventDefault();
        adjustUserAgentByUrl(view.webContents, nextUrl);
        void view.webContents.loadURL(nextUrl);
        return;
      }
      // open new window
      if (isInternalUrl(nextUrl, [appUrl, currentUrl])) {
        openInNewWindow();
        return;
      }
      // special case for Roam Research
      // if popup window is not opened and loaded, Roam crashes (shows white page)
      // https://github.com/atomery/webcatalog/issues/793
      if (appDomain === 'roamresearch.com' && nextDomain !== undefined && (disposition === 'foreground-tab' || disposition === 'background-tab')) {
        event.preventDefault();
        void shell.openExternal(nextUrl);
        // mock window
        // close as soon as it did-navigate
        const newOptions: BrowserWindowConstructorOptions = {
          ...options,
          show: false,
        };
        const popupWin = new BrowserWindow(newOptions);
        // WebCatalog internal value to determine whether BrowserWindow is popup
        // FIXME: WebCatalog internal value to determine whether BrowserWindow is popup
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        (popupWin as any).isPopup = true;
        // @ts-expect-error ts-migrate(2769) FIXME: No overload matches this call.
        popupWin.once('did-navigate', () => {
          popupWin.close();
        });
        // FIXME: type definition of event
        // @ts-expect-error Property 'newGuest' does not exist on type 'Event'.ts(2339)
        event.newGuest = popupWin;
        return;
      }
      // open external url in browser
      if (nextDomain !== undefined && (disposition === 'foreground-tab' || disposition === 'background-tab')) {
        event.preventDefault();
        void shell.openExternal(nextUrl);
        return;
      }
      // App tries to open external link using JS
      // nextURL === 'about:blank' but then window will redirect to the external URL
      // https://github.com/quanglam2807/webcatalog/issues/467#issuecomment-569857721
      if (nextDomain === null && (disposition === 'foreground-tab' || disposition === 'background-tab')) {
        event.preventDefault();
        const newOptions = {
          ...options,
          show: false,
        };
        const popupWin = new BrowserWindow(newOptions);
        popupWin.setMenuBarVisibility(false);
        popupWin.webContents.on('new-window', handleNewWindow);
        popupWin.webContents.once('will-navigate', (_, url) => {
          // if the window is used for the current app, then use default behavior
          if (isInternalUrl(url, [appUrl, currentUrl])) {
            popupWin.show();
          } else {
            // if not, open in browser
            event.preventDefault();
            void shell.openExternal(url);
            popupWin.close();
          }
        });
        // FIXME: type definition of event
        // @ts-expect-error Property 'newGuest' does not exist on type 'Event'.ts(2339)
        event.newGuest = popupWin;
      }
    };
    view.webContents.on('new-window', handleNewWindow);
    // Handle downloads
    // https://electronjs.org/docs/api/download-item
    view.webContents.session.on('will-download', (_event, item) => {
      const { askForDownloadPath, downloadPath } = this.preferenceService.getPreferences();
      // Set the save path, making Electron not to prompt a save dialog.
      if (!askForDownloadPath) {
        const finalFilePath = path.join(downloadPath, item.getFilename());
        if (!fsExtra.existsSync(finalFilePath)) {
          // eslint-disable-next-line no-param-reassign
          item.savePath = finalFilePath;
        }
      } else {
        // set preferred path for save dialog
        const options = {
          ...item.getSaveDialogOptions(),
          defaultPath: path.join(downloadPath, item.getFilename()),
        };
        item.setSaveDialogOptions(options);
      }
    });
    // Unread count badge
    if (unreadCountBadge) {
      view.webContents.on('page-title-updated', (_event, title) => {
        const itemCountRegex = /[([{](\d*?)[)\]}]/;
        const match = itemCountRegex.exec(title);
        const incString = match !== null ? match[1] : '';
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        const inc = Number.parseInt(incString, 10) || 0;
        this.workspaceService.updateMetaData(workspace.id, {
          badgeCount: inc,
        });
        let count = 0;
        const workspaceMetaData = this.workspaceService.getAllMetaData();
        Object.values(workspaceMetaData).forEach((metaData) => {
          if (typeof metaData?.badgeCount === 'number') {
            count += metaData.badgeCount;
          }
        });
        app.badgeCount = count;
        if (process.platform === 'win32') {
          if (count > 0) {
            // TODO: seems this is not good?
            // @ts-expect-error should be Electron.NativeImage here
            browserWindow.setOverlayIcon(path.resolve(buildResourcePath, 'overlay-icon.png'), `You have ${count} new messages.`);
          } else {
            // eslint-disable-next-line unicorn/no-null
            browserWindow.setOverlayIcon(null, '');
          }
        }
      });
    }
    // Find In Page
    view.webContents.on('found-in-page', (_event, result) => {
      sendToAllWindows('update-find-in-page-matches', result.activeMatchOrdinal, result.matches);
    });
    // Link preview
    view.webContents.on('update-target-url', (_event, url) => {
      try {
        view.webContents.send('update-target-url', url);
      } catch (error) {
        console.log(error); // eslint-disable-line no-console
      }
    });
    // Handle audio & notification preferences
    if (this.shouldMuteAudio !== undefined) {
      view.webContents.audioMuted = this.shouldMuteAudio;
    }
    view.webContents.once('did-stop-loading', () => {
      view.webContents.send('should-pause-notifications-changed', workspace.disableNotifications || this.shouldPauseNotifications);
    });
    this.views[workspace.id] = view;
    if (workspace.active) {
      browserWindow.setBrowserView(view);
      const contentSize = browserWindow.getContentSize();
      // @ts-expect-error ts-migrate(2554) FIXME: Expected 4 arguments, but got 1.
      view.setBounds(getViewBounds(contentSize));
      view.setAutoResize({
        width: true,
        height: true,
      });
    }
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const initialUrl = (rememberLastPageVisited && workspace.lastUrl) || workspace.homeUrl;
    adjustUserAgentByUrl(view.webContents, initialUrl);
    // start wiki on startup, or on sub-wiki creation
    await wikiStartup(workspace);
    void view.webContents.loadURL(initialUrl);
  }

  public getView = (id: string): BrowserView => this.views[id];

  public forEachView(functionToRun: (view: BrowserView, id: string) => void): void {
    Object.keys(this.views).forEach((id) => functionToRun(this.getView(id), id));
  }

  public async setActiveView(browserWindow: BrowserWindow, id: string): Promise<void> {
    // stop find in page when switching workspaces
    const currentView = browserWindow.getBrowserView();
    if (currentView !== null) {
      currentView.webContents.stopFindInPage('clearSelection');
      // FIXME: is this useful?
      // browserWindow.send('close-find-in-page');
    }
    const workspace = this.workspaceService.get(id);
    if (this.getView(id) === undefined && workspace !== undefined) {
      return await this.addView(browserWindow, workspace);
    } else {
      const view = this.getView(id);
      browserWindow.setBrowserView(view);
      const contentSize = browserWindow.getContentSize();
      if (typeof this.workspaceService.getMetaData(id).didFailLoadErrorMessage !== 'string') {
        view.setBounds(getViewBounds(contentSize as [number, number], false, 0, 0)); // hide browserView to show error message
      } else {
        view.setBounds(getViewBounds(contentSize as [number, number]));
      }
      view.setAutoResize({
        width: true,
        height: true,
      });
      // focus on webview
      // https://github.com/quanglam2807/webcatalog/issues/398
      view.webContents.focus();
      sendToAllWindows('update-address', view.webContents.getURL(), false);
      sendToAllWindows('update-title', view.webContents.getTitle());
      browserWindow.setTitle(view.webContents.getTitle());
    }
  }

  public removeView = (id: string): void => {
    const view = this.getView(id);
    void session.fromPartition(`persist:${id}`).clearStorageData();
    // FIXME: Property 'destroy' does not exist on type 'BrowserView'.ts(2339) , might related to https://github.com/electron/electron/pull/25411 which previously cause crush when I quit the app
    // if (view !== undefined) {
    //   view.destroy();
    // }
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.views[id];
  };

  public setViewsAudioPref = (_shouldMuteAudio?: boolean): void => {
    if (_shouldMuteAudio !== undefined) {
      this.shouldMuteAudio = _shouldMuteAudio;
    }
    Object.keys(this.views).forEach((id) => {
      const view = this.getView(id);
      const workspace = this.workspaceService.get(id);
      if (view !== undefined) {
        if (workspace !== undefined) {
          view.webContents.audioMuted = workspace.disableAudio || this.shouldMuteAudio;
        }
      }
    });
  };

  public setViewsNotificationsPref = (_shouldPauseNotifications?: boolean): void => {
    if (_shouldPauseNotifications !== undefined) {
      this.shouldPauseNotifications = _shouldPauseNotifications;
    }
    Object.keys(this.views).forEach((id) => {
      const view = this.getView(id);
      const workspace = this.workspaceService.get(id);
      if (view !== undefined && workspace !== undefined) {
        view.webContents.send('should-pause-notifications-changed', Boolean(workspace.disableNotifications || this.shouldPauseNotifications));
      }
    });
  };

  public hibernateView = (id: string): void => {
    if (this.getView(id) !== undefined) {
      // FIXME: remove view
      // @ts-expect-error Property 'destroy' does not exist on type 'BrowserView'.ts(2339)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      this.getView(id).destroy();
      this.removeView(id);
    }
  };

  public reloadViewsDarkReader(): void {
    Object.keys(this.views).forEach((id) => {
      const view = this.getView(id);
      if (view !== undefined) {
        view.webContents.send('reload-dark-reader');
      }
    });
  }

  public reloadViewsWebContentsIfDidFailLoad(): void {
    const workspaceMetaData = this.workspaceService.getAllMetaData();
    Object.keys(workspaceMetaData).forEach((id) => {
      if (typeof workspaceMetaData[id].didFailLoadErrorMessage !== 'string') {
        return;
      }
      const view = this.getView(id);
      if (view !== undefined) {
        view.webContents.reload();
      }
    });
  }

  public reloadViewsWebContents(): void {
    const workspaceMetaData = this.workspaceService.getAllMetaData();
    Object.keys(workspaceMetaData).forEach((id) => {
      const view = this.getView(id);
      if (view !== undefined) {
        view.webContents.reload();
      }
    });
  }

  public getActiveBrowserView(): BrowserView | undefined {
    const workspace = this.workspaceService.getActiveWorkspace();
    if (workspace !== undefined) {
      return this.getView(workspace.id);
    }
  }

  public realignActiveView = (browserWindow: BrowserWindow, activeId: string): void => {
    const view = browserWindow.getBrowserView();
    if (view?.webContents !== null) {
      const contentSize = browserWindow.getContentSize();
      if (typeof this.workspaceService.getMetaData(activeId).didFailLoadErrorMessage === 'string') {
        view?.setBounds(getViewBounds(contentSize as [number, number], false, 0, 0)); // hide browserView to show error message
      } else {
        view?.setBounds(getViewBounds(contentSize as [number, number]));
      }
    }
  };
}
