import { container } from '@services/container';
import { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { IViewService } from '@services/view/interface';
import { IWorkspaceViewService } from '@services/workspacesView/interface';
import { BrowserWindow } from 'electron';
import { IWindowService } from './interface';
import { WindowNames } from './WindowProperties';

export function registerBrowserViewWindowListeners(newWindow: BrowserWindow, windowName: WindowNames): void {
  const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);
  const windowService = container.get<IWindowService>(serviceIdentifier.Window);
  const workspaceViewService = container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView);
  const viewService = container.get<IViewService>(serviceIdentifier.View);

  // Enable swipe to navigate
  void preferenceService.get('swipeToNavigate').then((swipeToNavigate) => {
    if (swipeToNavigate) {
      if (newWindow === undefined) return;
      newWindow.on('swipe', async (_event, direction) => {
        const view = await viewService.getActiveBrowserView();

        if (view) {
          if (direction === 'left') {
            // eslint-disable-next-line @typescript-eslint/no-deprecated
            view.webContents.goBack();
          } else if (direction === 'right') {
            // eslint-disable-next-line @typescript-eslint/no-deprecated
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

  newWindow.on('focus', async () => {
    if (windowName !== WindowNames.main || newWindow === undefined) return;
    const view = await viewService.getActiveBrowserView();

    view?.webContents.focus();
  });

  newWindow.on('enter-full-screen', async () => {
    if (windowName !== WindowNames.main || newWindow === undefined) return;
    newWindow.webContents.send('is-fullscreen-updated', true);
    await workspaceViewService.realignActiveWorkspace();
  });
  newWindow.on('leave-full-screen', async () => {
    if (windowName !== WindowNames.main || newWindow === undefined) return;
    newWindow.webContents.send('is-fullscreen-updated', false);
    await workspaceViewService.realignActiveWorkspace();
  });
}
