import { container } from '@services/container';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IViewService } from '@services/view/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';
import { BrowserWindow } from 'electron';
import type { IWindowService } from './interface';
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
        const activeWs = await container.get<IWorkspaceService>(serviceIdentifier.Workspace).getActiveWorkspace();
        const view = activeWs ? viewService.getView(activeWs.id, WindowNames.main) : undefined;

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
  newWindow.on('close', (event) => {
    // only do this for main window
    if (windowName !== WindowNames.main || newWindow === undefined) return;
    // event.preventDefault() must be called synchronously — calling it after any await has no effect because
    // Electron checks the flag once all synchronous listeners have returned.
    const windowMeta = windowService.getWindowMetaSync(windowName);
    const runOnBackground = preferenceService.getPreferences().runOnBackground;
    if (runOnBackground && windowMeta?.forceClose !== true) {
      event.preventDefault();
      void windowService.hide(windowName);
    }
  });

  newWindow.on('focus', async () => {
    if (windowName !== WindowNames.main || newWindow === undefined) return;
    const activeWs = await container.get<IWorkspaceService>(serviceIdentifier.Workspace).getActiveWorkspace();
    const view = activeWs ? viewService.getView(activeWs.id, WindowNames.main) : undefined;

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

  // On Windows, minimizing fires a resize event with getContentSize()=[0,0].
  // The resize handler is guarded against 0x0, so bounds are preserved while minimized.
  // On restore, re-apply correct bounds to all windows (main + tidgi mini) in case the window
  // was brought back from a state where bounds could not be set.
  newWindow.on('restore', async () => {
    if (newWindow === undefined) return;
    await workspaceViewService.realignActiveWorkspace();
  });

  // When the window becomes visible again (e.g. from tray/hide), force-show the active view
  // before realigning.  A plain realignActiveWorkspace() only calls setBounds which the
  // compositor may ignore if bounds haven't changed.  refreshActiveWorkspaceView() calls
  // showView() → removeChildView + addChildView + focus, which forces a repaint.
  newWindow.on('show', async () => {
    if (newWindow === undefined) return;
    await workspaceViewService.refreshActiveWorkspaceView();
  });
}
