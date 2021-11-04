import { WikiChannel } from '@/constants/channels';
import { container } from '@services/container';
import serviceIdentifier from '@services/serviceIdentifier';
import { IViewService } from '@services/view/interface';
import { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';

/**
 * Handle sending message to trigger operations defined in `src/preload/wikiOperation.ts`
 */
export const wikiOperations = {
  [WikiChannel.createProgress]: (message: string): void => {
    const windowService = container.get<IWindowService>(serviceIdentifier.Window);
    const createWorkspaceWindow = windowService.get(WindowNames.addWorkspace);
    createWorkspaceWindow?.webContents?.send(WikiChannel.createProgress, message);
  },
  [WikiChannel.syncProgress]: async (message: string): Promise<void> => {
    const viewService = container.get<IViewService>(serviceIdentifier.View);
    const browserViews = await viewService.getActiveBrowserViews();
    browserViews.forEach((browserView) => {
      if (browserView !== undefined) {
        browserView.webContents.send(WikiChannel.syncProgress, message);
      }
    });
  },
  [WikiChannel.generalNotification]: async (message: string): Promise<void> => {
    const viewService = container.get<IViewService>(serviceIdentifier.View);
    const browserViews = await viewService.getActiveBrowserViews();
    browserViews.forEach((browserView) => {
      if (browserView !== undefined) {
        browserView.webContents.send(WikiChannel.generalNotification, message);
      }
    });
  },
  // TODO: add more operations here from `src/preload/wikiOperation.ts`
};
export type IWikiOperations = typeof wikiOperations;
