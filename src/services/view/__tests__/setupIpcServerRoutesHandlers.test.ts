import { container } from '@services/container';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { wikiWorkspaceDefaultValues } from '@services/workspaces/interface';
import { WorkspaceType } from '@services/workspaces/workspaceType';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupIpcServerRoutesHandlers } from '../setupIpcServerRoutesHandlers';

type ProtocolHandler = (request: Request) => Promise<Response>;

function createWorkspace(id: string) {
  return {
    ...wikiWorkspaceDefaultValues,
    id,
    name: 'Test Wiki',
    wikiFolderLocation: '/tmp/test-wiki',
    homeUrl: `tidgi://${id}`,
    workspaceType: WorkspaceType.folder,
  };
}

describe('setupIpcServerRoutesHandlers workspace identity', () => {
  let protocolHandler: ProtocolHandler;
  let workspaceService: IWorkspaceService;
  let wikiService: IWikiService;
  let callWikiIpcServerRoute: ReturnType<typeof vi.fn>;

  beforeAll(() => {
    if (!container.isBound(serviceIdentifier.DeepLink)) {
      container.bind(serviceIdentifier.DeepLink).toConstantValue({
        openDeepLink: vi.fn().mockResolvedValue(undefined),
      });
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
    callWikiIpcServerRoute = vi.fn().mockResolvedValue({
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      data: '<html></html>',
    });
    Object.assign(wikiService, { callWikiIpcServerRoute });
  });

  function registerHandler(workspaceID: string): void {
    const protocol = {
      isProtocolHandled: vi.fn().mockReturnValue(false),
      handle: vi.fn((_scheme: string, callback: ProtocolHandler) => {
        protocolHandler = callback;
      }),
    };
    const view = { webContents: { session: { protocol } } };

    setupIpcServerRoutesHandlers(view as never, workspaceID);
  }

  it('accepts a canonical lowercase host for its attached workspace', async () => {
    const workspaceID = 'abcdefghijklmnopqrstu';
    const workspace = createWorkspace(workspaceID);
    (workspaceService.get as ReturnType<typeof vi.fn>).mockResolvedValue(workspace);
    registerHandler(workspaceID);

    const response = await protocolHandler({
      method: 'GET',
      url: `tidgi://${workspaceID}/`,
    } as unknown as Request);

    expect(response.status).toBe(200);
    expect(callWikiIpcServerRoute).toHaveBeenCalledWith(
      workspaceID,
      'getIndex',
      '$:/core/save/lazy-images',
    );
  });

  it('rejects a host whose case differs from the attached workspace ID', async () => {
    const workspaceID = 'Abcdefghijklmnopqrstu';
    registerHandler(workspaceID);

    // Electron canonicalizes a standard custom-scheme host before invoking
    // this callback; model that lowercased host while keeping the attached ID.
    const response = await protocolHandler({
      method: 'GET',
      url: `tidgi://${workspaceID.toLowerCase()}/`,
    } as unknown as Request);

    expect(response.status).toBe(404);
    expect(callWikiIpcServerRoute).not.toHaveBeenCalled();
  });
});
