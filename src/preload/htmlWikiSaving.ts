import { contextBridge } from 'electron';

import type { IBrowserViewMetaData } from '@services/windows/WindowProperties';
import type { IHtmlWikiWorkspace } from '@services/workspaces/interface';

import { browserViewMetaData } from './common/browserViewMetaData';
import { htmlWiki } from './common/services';

declare global {
  interface Window {
    tidgiHtmlWikiSave?: (htmlContent: string) => Promise<void>;
  }
}

function getHtmlWikiWorkspaceFromMeta(): IHtmlWikiWorkspace | undefined {
  const workspace = (browserViewMetaData as IBrowserViewMetaData).workspace;
  if (workspace && 'htmlFileLocation' in workspace && typeof workspace.htmlFileLocation === 'string') {
    return workspace as IHtmlWikiWorkspace;
  }
  return undefined;
}

export function exposeHtmlWikiSavingBridge(): void {
  const workspace = getHtmlWikiWorkspaceFromMeta();
  if (!workspace?.id) {
    return;
  }
  const workspaceID = workspace.id;
  contextBridge.exposeInMainWorld('tidgiHtmlWikiSave', async (htmlContent: string) => {
    const response = await htmlWiki.saveHtmlResponse(workspaceID, htmlContent);
    if ((response.statusCode ?? 500) >= 400) {
      throw new Error(typeof response.data === 'string' ? response.data : 'Failed to save HTML wiki');
    }
  });
}
