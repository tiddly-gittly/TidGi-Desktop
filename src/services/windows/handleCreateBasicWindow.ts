import { isTest } from '@/constants/environment';
import type { IAuthenticationService } from '@services/auth/interface';
import { container } from '@services/container';
import type { IMenuService } from '@services/menu/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IThemeService } from '@services/theme/interface';
import { app, BrowserWindow, BrowserWindowConstructorOptions } from 'electron';
import type { IWindowOpenConfig, IWindowService } from './interface';
import { getMainWindowEntry } from './viteEntry';
import { WindowMeta, WindowNames } from './WindowProperties';

export async function handleCreateBasicWindow<N extends WindowNames>(
  windowName: N,
  windowConfig: BrowserWindowConstructorOptions,
  windowMeta: WindowMeta[N] = {} as WindowMeta[N],
  config?: IWindowOpenConfig<N>,
): Promise<BrowserWindow> {
  const menuService = container.get<IMenuService>(serviceIdentifier.MenuService);
  const windowService = container.get<IWindowService>(serviceIdentifier.Window);

  const newWindow = new BrowserWindow(windowConfig);
  const newWindowURL = (windowMeta !== undefined && 'uri' in windowMeta ? windowMeta.uri : undefined) ?? getMainWindowEntry();
  if (config?.multiple !== true) {
    windowService.set(windowName, newWindow);
  }

  const unregisterContextMenu = await menuService.initContextMenuForWindowWebContents(newWindow.webContents);
  newWindow.on('closed', () => {
    windowService.set(windowName, undefined);
    unregisterContextMenu();
  });

  // Handle OAuth redirect for preferences/addWorkspace windows
  if (windowName === WindowNames.preferences || windowName === WindowNames.addWorkspace) {
    const authService = container.get<IAuthenticationService>(serviceIdentifier.Authentication);
    authService.setupOAuthRedirectHandler(newWindow, getMainWindowEntry, WindowNames.preferences);
  }

  let webContentLoadingPromise: Promise<void> | undefined;
  if (windowName === WindowNames.main) {
    // handle window show and Webview/browserView show
    webContentLoadingPromise = new Promise<void>((resolve, reject) => {
      newWindow.once('ready-to-show', () => {
        const mainWindow = windowService.get(WindowNames.main);
        if (mainWindow === undefined) {
          reject(new Error("Main window is undefined in newWindow.once('ready-to-show'"));
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        const { wasOpenedAsHidden } = app.getLoginItemSettings();
        // Don't bring up window when running e2e test, otherwise it will annoy the developer who is doing other things.
        if (!wasOpenedAsHidden && !isTest) {
          mainWindow.show();
        }
        // ensure redux is loaded first
        // if not, redux might not be able catch changes sent from ipcMain
        if (!mainWindow.webContents.isLoading()) {
          resolve();
          return;
        }
        mainWindow.webContents.once('did-stop-loading', () => {
          resolve();
        });
      });
    });
  }
  await updateWindowBackground(newWindow);
  // Not loading main window (like sidebar and background) here. Only load wiki in browserView in the secondary window. Secondary window will use a WebContentsView to load content, and without main content like sidebar and Guide.
  const isWindowToLoadURL = windowName !== WindowNames.secondary;
  if (isWindowToLoadURL) {
    // This loading will wait for a while
    await newWindow.loadURL(newWindowURL);
  }
  await webContentLoadingPromise;
  return newWindow;
}

async function updateWindowBackground(newWindow: BrowserWindow): Promise<void> {
  const themeService = container.get<IThemeService>(serviceIdentifier.ThemeService);
  if (await themeService.shouldUseDarkColors()) {
    newWindow.setBackgroundColor('#000000');
  }
}
