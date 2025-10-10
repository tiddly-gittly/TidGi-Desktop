import { DEFAULT_DOWNLOADS_PATH } from '@/constants/appPaths';
import { MetaDataChannel, WikiChannel } from '@/constants/channels';
import { isHtmlWiki, wikiHtmlExtensions } from '@/constants/fileNames';
import { container } from '@services/container';
import getFromRenderer from '@services/libs/getFromRenderer';
import { i18n } from '@services/libs/i18n';
import { isBrowserWindow } from '@services/libs/isBrowserWindow';
import { logger } from '@services/libs/log';
import type { IMenuService } from '@services/menu/interface';
import type { INativeService } from '@services/native/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IViewService } from '@services/view/interface';
import type { IWikiService } from '@services/wiki/interface';
import type { IWindowService } from '@services/windows/interface';
import type { IBrowserViewMetaData } from '@services/windows/WindowProperties';
import { WindowNames } from '@services/windows/WindowProperties';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';
import { clipboard, dialog } from 'electron';
import { CancelError as DownloadCancelError, download } from 'electron-dl';
import { minify } from 'html-minifier-terser';
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
      click: async () => (await viewService.getActiveBrowserView())?.webContents.openDevTools({ mode: 'detach' }),
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
            `print page, browserView printToPDF method is ${browserView?.webContents.printToPDF === undefined ? 'undefined' : 'define'}, win is ${
              win === undefined ? 'undefined' : 'define'
            }`,
          );
          if (browserView === undefined || win === undefined) {
            return;
          }
          const pdfBuffer = await browserView.webContents.printToPDF({
            generateTaggedPDF: true,
          });
          // turn buffer to data uri
          const dataUri = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
          await download(win, dataUri, { filename: 'wiki.pdf', overwrite: false });
          logger.info(`print page done`);
        } catch (error) {
          if (error instanceof DownloadCancelError) {
            logger.debug('cancelled', { function: 'registerMenu.printPage' });
          } else {
            const error_ = error instanceof Error ? error : new Error(String(error));
            logger.error('print page error', { function: 'registerMenu.printPage', error: error_.message, errorObj: error_ });
          }
        }
      },
      enabled: hasActiveWorkspaces,
    },
    {
      label: () => i18n.t('Menu.ExportActiveTiddler'),
      accelerator: 'CmdOrCtrl+Alt+Shift+P',
      click: async () => {
        const activeWorkspace = await workspaceService.getActiveWorkspace();
        if (activeWorkspace === undefined) {
          logger.error('Can not print active tiddler, activeWorkspace is undefined');
          return;
        }
        const title = await wikiService.wikiOperationInBrowser(WikiChannel.getTiddlerText, activeWorkspace.id, ['$:/temp/focussedTiddler']);
        if (title === undefined) {
          const mainWindow = windowService.get(WindowNames.main);
          if (mainWindow === undefined) return;
          void dialog.showMessageBox(mainWindow, {
            title: i18n.t('Dialog.FocusedTiddlerNotFoundTitle'),
            message: i18n.t('Dialog.FocusedTiddlerNotFoundTitleDetail'),
            buttons: ['OK'],
            cancelId: 0,
            defaultId: 0,
          });
          return;
        }
        const htmlContent = await wikiService.wikiOperationInBrowser(WikiChannel.renderTiddlerOuterHTML, activeWorkspace.id, [title]);
        // download html content
        const win = windowService.get(WindowNames.main);
        if (win === undefined || htmlContent === undefined) return;
        const minified = await minify(htmlContent, {
          minifyCSS: {
            level: 2,
          },
          collapseWhitespace: true,
          collapseInlineTagWhitespace: true,
          continueOnParseError: true,
          removeComments: true,
        });
        await download(win, `data:text/html,${encodeURIComponent(minified)}`, { filename: `${title}.html`, saveAs: true });
      },
      enabled: hasActiveWorkspaces,
    },
    {
      label: () => i18n.t('Menu.ExportWholeWikiHTML'),
      click: async () => {
        const activeWorkspace = await workspaceService.getActiveWorkspace();
        if (activeWorkspace === undefined) {
          logger.error('Can not export whole wiki, activeWorkspace is undefined');
          return;
        }
        if (!isWikiWorkspace(activeWorkspace)) {
          logger.error('Can not export whole wiki, activeWorkspace is not a wiki workspace');
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
        const url = view?.webContents.getURL();
        if (typeof url === 'string') {
          clipboard.writeText(url);
        }
      },
    },
  ]);
}
