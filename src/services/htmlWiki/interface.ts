import { HtmlWikiChannel } from '@/constants/channels';
import type { IWikiServerRouteResponse } from '@services/wiki/wikiWorker/ipcServerRoutes';
import type { IHtmlWikiWorkspace, IWorkspace } from '@services/workspaces/interface';
import { ProxyPropertyType } from 'electron-ipc-cat/common';

export interface IHtmlWikiService {
  checkHtmlWikiExist(workspace: IHtmlWikiWorkspace, options?: { showDialog?: boolean }): Promise<string | true>;
  startWorkspace(workspace: IHtmlWikiWorkspace): Promise<void>;
  stopWorkspace(workspaceID: string): Promise<void>;
  restartWorkspace(workspace: IHtmlWikiWorkspace): Promise<void>;
  readHtmlFile(htmlFileLocation: string): Promise<string>;
  writeHtmlFile(htmlFileLocation: string, content: string): Promise<void>;
  validateHtmlFile(htmlFileLocation: string): Promise<void>;
  getIndexResponse(workspaceID: string): Promise<IWikiServerRouteResponse>;
  saveHtmlResponse(workspaceID: string, htmlContent: string): Promise<IWikiServerRouteResponse>;
  getStatusResponse(workspaceID: string, userName: string): Promise<IWikiServerRouteResponse>;
  handleHttpRequest(workspaceID: string, method: string, body?: string): Promise<{ statusCode: number; headers: Record<string, string>; body: string | Buffer }>;
}

export const HtmlWikiServiceIPCDescriptor = {
  channel: HtmlWikiChannel.name,
  properties: {
    checkHtmlWikiExist: ProxyPropertyType.Function,
    getIndexResponse: ProxyPropertyType.Function,
    getStatusResponse: ProxyPropertyType.Function,
    handleHttpRequest: ProxyPropertyType.Function,
    readHtmlFile: ProxyPropertyType.Function,
    restartWorkspace: ProxyPropertyType.Function,
    saveHtmlResponse: ProxyPropertyType.Function,
    startWorkspace: ProxyPropertyType.Function,
    stopWorkspace: ProxyPropertyType.Function,
    validateHtmlFile: ProxyPropertyType.Function,
    writeHtmlFile: ProxyPropertyType.Function,
  },
};

export type { IHtmlWikiWorkspace, IWorkspace };
