import type { DownloadItem, Event, WebContentsView } from 'electron';
import path from 'path';

import { container } from '@services/container';
import type { IHtmlWikiService } from '@services/htmlWiki/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IHtmlWikiWorkspace } from '@services/workspaces/interface';

function isLikelyHtmlWikiSaveDownload(item: DownloadItem, workspace: IHtmlWikiWorkspace): boolean {
  const managedFileName = path.basename(workspace.htmlFileLocation);
  const filename = item.getFilename();
  const mimeType = item.getMimeType() ?? '';
  const downloadUrl = item.getURL();
  const isRendererGeneratedDownload = downloadUrl.startsWith('blob:') || downloadUrl.startsWith('data:text/html');
  const isLikelyAttachment = /\.(png|jpe?g|gif|webp|svg|pdf|zip|json|tid)$/i.test(filename);
  return (
    isRendererGeneratedDownload &&
    !isLikelyAttachment &&
    (mimeType.includes('text/html') || /\.html?$/i.test(filename) || filename === managedFileName)
  );
}

/**
 * Fallback for HTML wikis that still reach TiddlyWiki's DownloadSaver.
 *
 * `injectHtmlWikiSaverBootstrap` is the primary path: it patches the wiki page
 * before saving so content is sent through TidGi directly. This handler sits at
 * Electron's download boundary and only catches renderer-generated HTML downloads
 * that escaped that bootstrap path.
 */
export function tryInterceptHtmlWikiDownload(
  event: Event,
  item: DownloadItem,
  view: WebContentsView,
  workspace: IHtmlWikiWorkspace,
): boolean {
  const filename = item.getFilename();
  const downloadUrl = item.getURL();
  if (!isLikelyHtmlWikiSaveDownload(item, workspace)) {
    return false;
  }

  event.preventDefault();
  const htmlWikiService = container.get<IHtmlWikiService>(serviceIdentifier.HtmlWiki);

  void (async () => {
    try {
      const htmlContent = await view.webContents.executeJavaScript(
        `fetch(${JSON.stringify(downloadUrl)}).then(response => response.text())`,
        true,
      ) as string;
      if (!htmlContent || htmlContent.length === 0) {
        throw new Error('Empty HTML content from wiki render intercept');
      }
      await htmlWikiService.saveHtmlResponse(workspace.id, htmlContent);
    } catch (error) {
      logger.error('HTML wiki download intercept failed', {
        workspaceId: workspace.id,
        filename,
        downloadUrl,
        error,
      });
    }
  })();

  return true;
}
