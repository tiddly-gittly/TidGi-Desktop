import { isTest } from '@/constants/environment';
import { TIDGI_MINI_WINDOW_ICON_PATH } from '@/constants/paths';
import { isMac } from '@/helpers/system';
import { container } from '@services/container';
import { i18n } from '@services/libs/i18n';
import { logger } from '@services/libs/log';
import type { IMenuService } from '@services/menu/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IViewService } from '@services/view/interface';
import { BrowserWindowConstructorOptions, Menu, nativeImage, Tray } from 'electron';
import windowStateKeeper from 'electron-window-state';
import { debounce } from 'lodash';
import { Menubar, menubar } from 'menubar';
import type { IWindowService } from './interface';
import { getMainWindowEntry } from './viteEntry';
import { WindowNames } from './WindowProperties';

export async function handleAttachToTidgiMiniWindow(
  windowConfig: BrowserWindowConstructorOptions,
  windowWithBrowserViewState: windowStateKeeper.State | undefined,
): Promise<Menubar> {
  const menuService = container.get<IMenuService>(serviceIdentifier.MenuService);
  const windowService = container.get<IWindowService>(serviceIdentifier.Window);
  const viewService = container.get<IViewService>(serviceIdentifier.View);
  const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);

  // Get tidgi mini window-specific titleBar preference
  const tidgiMiniWindowShowTitleBar = await preferenceService.get('tidgiMiniWindowShowTitleBar');

  // setImage after Tray instance is created to avoid
  // "Segmentation fault (core dumped)" bug on Linux
  // https://github.com/electron/electron/issues/22137#issuecomment-586105622
  // https://github.com/atomery/translatium/issues/164
  const tray = new Tray(nativeImage.createEmpty());
  // icon template is not supported on Windows & Linux
  tray.setImage(nativeImage.createFromPath(TIDGI_MINI_WINDOW_ICON_PATH));

  // Create tidgi mini window-specific window configuration
  // Override titleBar settings from windowConfig with tidgi mini window-specific preference
  const tidgiMiniWindowConfig: BrowserWindowConstructorOptions = {
    ...windowConfig,
    show: false,
    minHeight: 100,
    minWidth: 250,
    // Use tidgi mini window-specific titleBar setting instead of inheriting from main window
    titleBarStyle: tidgiMiniWindowShowTitleBar ? 'default' : 'hidden',
    frame: tidgiMiniWindowShowTitleBar,
    // Always hide the menu bar (File, Edit, View menu), even when showing title bar
    autoHideMenuBar: true,
  };

  logger.info('Creating tidgi mini window with titleBar configuration', {
    function: 'handleAttachToTidgiMiniWindow',
    tidgiMiniWindowShowTitleBar,
    titleBarStyle: tidgiMiniWindowConfig.titleBarStyle,
    frame: tidgiMiniWindowConfig.frame,
  });

  const tidgiMiniWindow = menubar({
    index: getMainWindowEntry(),
    tray,
    activateWithApp: false,
    showDockIcon: true,
    preloadWindow: true,
    tooltip: i18n.t('Menu.TidGiMiniWindow'),
    browserWindow: tidgiMiniWindowConfig,
  });

  tidgiMiniWindow.on('after-create-window', () => {
    if (tidgiMiniWindow.window !== undefined) {
      tidgiMiniWindow.window.on('focus', async () => {
        logger.debug('restore window position', { function: 'handleAttachToTidgiMiniWindow' });
        if (windowWithBrowserViewState === undefined) {
          logger.debug('windowWithBrowserViewState is undefined for tidgiMiniWindow', { function: 'handleAttachToTidgiMiniWindow' });
        } else {
          if (tidgiMiniWindow.window === undefined) {
            logger.debug('tidgiMiniWindow.window is undefined', { function: 'handleAttachToTidgiMiniWindow' });
          } else {
            const haveXYValue = [windowWithBrowserViewState.x, windowWithBrowserViewState.y].every((value) => Number.isFinite(value));
            const haveWHValue = [windowWithBrowserViewState.width, windowWithBrowserViewState.height].every((value) => Number.isFinite(value));
            if (haveXYValue) {
              tidgiMiniWindow.window.setPosition(windowWithBrowserViewState.x, windowWithBrowserViewState.y, false);
            }
            if (haveWHValue) {
              tidgiMiniWindow.window.setSize(windowWithBrowserViewState.width, windowWithBrowserViewState.height, false);
            }
          }
        }
        const view = await viewService.getActiveBrowserView();
        view?.webContents.focus();
      });
      tidgiMiniWindow.window.removeAllListeners('close');
      tidgiMiniWindow.window.on('close', (event) => {
        event.preventDefault();
        tidgiMiniWindow.hideWindow();
      });
    }
  });
  // This will close main and preference window when mini window closed, thus make it impossible to test keyboard shortcut to open mini window again, make e2e test fail on mac. So commented out.
  // tidgiMiniWindow.on('hide', async () => {
  //   // on mac, calling `tidgiMiniWindow.app.hide()` with main window open will bring background main window up, which we don't want. We want to bring previous other app up. So close main window first.
  //   if (isMac) {
  //     const mainWindow = windowService.get(WindowNames.main);
  //     if (mainWindow?.isVisible() === true) {
  //       await windowService.hide(WindowNames.main);
  //     }
  //   }
  // });
  // https://github.com/maxogden/menubar/issues/120
  tidgiMiniWindow.on('after-hide', () => {
    if (isMac && !isTest) {
      tidgiMiniWindow.app.hide();
    }
  });

  // manually save window state https://github.com/mawie81/electron-window-state/issues/64
  const debouncedSaveWindowState = debounce(
    () => {
      if (tidgiMiniWindow.window !== undefined) {
        windowWithBrowserViewState?.saveState(tidgiMiniWindow.window);
      }
    },
    500,
  );
  // tidgi mini window is hide, not close, so not managed by windowStateKeeper, need to save manually
  tidgiMiniWindow.window?.on('resize', debouncedSaveWindowState);
  tidgiMiniWindow.window?.on('move', debouncedSaveWindowState);

  return await new Promise<Menubar>((resolve) => {
    tidgiMiniWindow.on('ready', async () => {
      // right on tray icon
      tidgiMiniWindow.tray.on('right-click', () => {
        const contextMenu = Menu.buildFromTemplate([
          {
            label: i18n.t('ContextMenu.OpenTidGi'),
            click: async () => {
              await windowService.open(WindowNames.main);
            },
          },
          {
            label: i18n.t('ContextMenu.OpenTidGiMiniWindow'),
            click: async () => {
              await tidgiMiniWindow.showWindow();
            },
          },
          {
            type: 'separator',
          },
          {
            label: i18n.t('ContextMenu.About'),
            click: async () => {
              await windowService.open(WindowNames.about);
            },
          },
          { type: 'separator' },
          {
            label: i18n.t('ContextMenu.Preferences'),
            click: async () => {
              await windowService.open(WindowNames.preferences);
            },
          },
          {
            label: i18n.t('ContextMenu.Notifications'),
            click: async () => {
              await windowService.open(WindowNames.notifications);
            },
          },
          { type: 'separator' },
          {
            label: i18n.t('ContextMenu.Quit'),
            click: () => {
              tidgiMiniWindow.app.quit();
            },
          },
        ]);

        tidgiMiniWindow.tray.popUpContextMenu(contextMenu);
      });

      // right click on window content
      if (tidgiMiniWindow.window?.webContents !== undefined) {
        const unregisterContextMenu = await menuService.initContextMenuForWindowWebContents(tidgiMiniWindow.window.webContents);
        tidgiMiniWindow.on('after-close', () => {
          unregisterContextMenu();
        });
      }

      resolve(tidgiMiniWindow);
    });
  });
}
