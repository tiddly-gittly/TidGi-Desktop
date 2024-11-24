import { DEFAULT_DOWNLOADS_PATH } from '@/constants/appPaths';
import { MetaDataChannel } from '@/constants/channels';
import { isHtmlWiki, wikiHtmlExtensions } from '@/constants/fileNames';
import { container } from '@services/container';
import getFromRenderer from '@services/libs/getFromRenderer';
import { i18n } from '@services/libs/i18n';
import { isBrowserWindow } from '@services/libs/isBrowserWindow';
import { logger } from '@services/libs/log';
import { IMenuService } from '@services/menu/interface';
import { INativeService } from '@services/native/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { IViewService } from '@services/view/interface';
import { IWikiService } from '@services/wiki/interface';
import { IWindowService } from '@services/windows/interface';
import { IBrowserViewMetaData, WindowNames } from '@services/windows/WindowProperties';
import { IWorkspaceService } from '@services/workspaces/interface';
import { clipboard } from 'electron';
import { CancelError as DownloadCancelError, download } from 'electron-dl';
import path from 'path';

export async function registerMenu(): Promise<void> {
  const menuService = container.get<IMenuService>(serviceIdentifier.MenuService);
  const windowService = container.get<IWindowService>(serviceIdentifier.Window);
  const viewService = container.get<IViewService>(serviceIdentifier.View);
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const nativeService = container.get<INativeService>(serviceIdentifier.NativeService);
  const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);

  const hasActiveWorkspaces = async (): Promise<boolean> => (await workspaceService.getActiveWorkspace()) !== undefined;

  await menuService.insertMenu('Workspaces', [
    {
      label: () => i18n.t('Menu.DeveloperToolsActiveWorkspace'),
      accelerator: 'CmdOrCtrl+Option+I',
      click: async () => (await viewService.getActiveBrowserView())?.webContents?.openDevTools?.({ mode: 'detach' }),
      enabled: hasActiveWorkspaces,
    },
  ]);
  await menuService.insertMenu('Wiki', [
    {
      label: () => i18n.t('Menu.PrintPage'),
      click: async () => {
        try {
          const browserView = await viewService.getActiveBrowserView();
          const win = windowService.get(WindowNames.main);
          logger.info(
            `print page, browserView printToPDF method is ${browserView?.webContents?.printToPDF === undefined ? 'undefined' : 'define'}, win is ${
              win === undefined ? 'undefined' : 'define'
            }`,
          );
          if (browserView === undefined || win === undefined) {
            return;
          }
          const pdfBuffer = await browserView?.webContents?.printToPDF({
            generateTaggedPDF: true,
          });
          // turn buffer to data uri
          const dataUri = `data:application/pdf;base64,${pdfBuffer?.toString('base64')}`;
          await download(win, dataUri, { filename: 'wiki.pdf', overwrite: false });
          logger.info(`print page done`);
        } catch (error) {
          if (error instanceof DownloadCancelError) {
            logger.debug('item.cancel() was called');
          } else {
            logger.error(`print page error: ${(error as Error).message}`, error);
          }
        }
      },
      enabled: hasActiveWorkspaces,
    },
    // TODO: get active tiddler title
    // {
    //   label: () => i18n.t('Menu.PrintActiveTiddler'),
    //   accelerator: 'CmdOrCtrl+Alt+Shift+P',
    //   click: async () => {
    //     await printTiddler(title);
    //   },
    //   enabled: hasActiveWorkspaces,
    // },
    {
      label: () => i18n.t('Menu.ExportWholeWikiHTML'),
      click: async () => {
        const activeWorkspace = await workspaceService.getActiveWorkspace();
        if (activeWorkspace === undefined) {
          logger.error('Can not export whole wiki, activeWorkspace is undefined');
          return;
        }
        const pathOfNewHTML = await nativeService.pickDirectory(DEFAULT_DOWNLOADS_PATH, {
          allowOpenFile: true,
          filters: [{ name: 'HTML', extensions: wikiHtmlExtensions }],
        });
        if (pathOfNewHTML.length > 0) {
          const fileName = isHtmlWiki(pathOfNewHTML[0]) ? pathOfNewHTML[0] : path.join(pathOfNewHTML[0], `${activeWorkspace.name}.html`);
          await wikiService.packetHTMLFromWikiFolder(activeWorkspace.wikiFolderLocation, fileName);
        } else {
          logger.error("Can not export whole wiki, pickDirectory's pathOfNewHTML is empty");
        }
      },
      enabled: hasActiveWorkspaces,
    },
    { type: 'separator' },
    {
      label: () => i18n.t('ContextMenu.CopyLink'),
      accelerator: 'CmdOrCtrl+L',
      click: async (_menuItem, browserWindow) => {
        // if back is called in popup window
        // copy the popup window URL instead
        if (isBrowserWindow(browserWindow)) {
          const { isPopup } = await getFromRenderer<IBrowserViewMetaData>(MetaDataChannel.getViewMetaData, browserWindow);
          if (isPopup === true) {
            const url = browserWindow.webContents.getURL();
            clipboard.writeText(url);
            return;
          }
        }
        const view = await viewService.getActiveBrowserView();
        const url = view?.webContents?.getURL();
        if (typeof url === 'string') {
          clipboard.writeText(url);
        }
      },
    },
  ]);
}
