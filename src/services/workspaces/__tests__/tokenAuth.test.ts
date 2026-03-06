import { SupportedStorageServices } from '@services/types';
import { describe, expect, it, vi } from 'vitest';
import { Workspace } from '../index';
import { type IWikiWorkspace, wikiWorkspaceDefaultValues } from '../interface';

vi.mock('../registerMenu', () => ({
  registerMenu: vi.fn(),
}));

function createWorkspace(overrides: Partial<IWikiWorkspace>): IWikiWorkspace {
  return {
    ...wikiWorkspaceDefaultValues,
    id: 'workspace-1',
    name: 'Workspace 1',
    wikiFolderLocation: '/tmp/workspace-1',
    isSubWiki: false,
    mainWikiID: null,
    mainWikiToLink: null,
    pageType: null,
    picturePath: null,
    homeUrl: 'tidgi://workspace-1',
    gitUrl: null,
    storageService: SupportedStorageServices.local,
    tagNames: [],
    userName: 'tester',
    ...overrides,
  };
}

function createWorkspaceService(workspace: IWikiWorkspace): Workspace {
  const service = new Workspace() as Workspace & { workspaces?: Record<string, IWikiWorkspace> };
  service.workspaces = { [workspace.id]: workspace };
  return service;
}

describe('Workspace token auth', () => {
  it('should not expose workspace token when token auth is disabled', async () => {
    const service = createWorkspaceService(createWorkspace({ authToken: 'secret-token', tokenAuth: false }));

    await expect(service.getWorkspaceToken('workspace-1')).resolves.toBeUndefined();
    await expect(service.validateWorkspaceToken('workspace-1', 'secret-token')).resolves.toBe(false);
  });

  it('should expose workspace token when token auth is enabled', async () => {
    const service = createWorkspaceService(createWorkspace({ authToken: 'secret-token', tokenAuth: true }));

    await expect(service.getWorkspaceToken('workspace-1')).resolves.toBe('secret-token');
    await expect(service.validateWorkspaceToken('workspace-1', 'secret-token')).resolves.toBe(true);
  });
});
