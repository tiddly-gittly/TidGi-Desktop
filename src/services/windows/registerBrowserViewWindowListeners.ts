import { container } from '@services/container';
import { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWorkspaceViewService } from '@services/workspacesView/interface';
import { BrowserWindow } from 'electron';
import { IWindowService } from './interface';
import { WindowNames } from './WindowProperties';

export function registerBrowserViewWindowListeners(newWindow: BrowserWindow, windowName: WindowNames): void {
  const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);
  const windowService = container.get<IWindowService>(serviceIdentifier.Window);
  const workspaceViewService = container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView);

  // Enable swipe to navigate
  void preferenceService.get('swipeToNavigate').then((swipeToNavigate) => {
    if (swipeToNavigate) {
      if (newWindow === undefined) return;
      newWindow.on('swipe', (_event, direction) => {
        const view = newWindow?.getBrowserView?.();
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (view) {
          if (direction === 'left') {
            view.webContents.goBack();
          } else if (direction === 'right') {
            view.webContents.goForward();
          }
        }
      });
    }
  });
  // Hide window instead closing on macos
  newWindow.on('close', async (event) => {
    // only do this for main window
    if (windowName !== WindowNames.main || newWindow === undefined) return;
    const windowMeta = await windowService.getWindowMeta(windowName);
    const runOnBackground = await preferenceService.get('runOnBackground');
    if (runOnBackground && windowMeta?.forceClose !== true) {
      event.preventDefault();
      await windowService.hide(windowName);
    }
  });

  newWindow.on('focus', () => {
    if (windowName !== WindowNames.main || newWindow === undefined) return;
    const view = newWindow?.getBrowserView?.();
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    view?.webContents?.focus?.();
  });

  newWindow.on('enter-full-screen', async () => {
    if (windowName !== WindowNames.main || newWindow === undefined) return;
    newWindow?.webContents?.send?.('is-fullscreen-updated', true);
    await workspaceViewService.realignActiveWorkspace();
  });
  newWindow.on('leave-full-screen', async () => {
    if (windowName !== WindowNames.main || newWindow === undefined) return;
    newWindow?.webContents?.send?.('is-fullscreen-updated', false);
    await workspaceViewService.realignActiveWorkspace();
  });
}
