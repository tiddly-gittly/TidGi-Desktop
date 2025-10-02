import { container } from '@services/container';
import serviceIdentifier from '@services/serviceIdentifier';
import type { ITiddlerFields } from 'tiddlywiki';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getWikiAgentTemplates, validateAndConvertWikiTiddlerToAgentTemplate } from '../getAgentDefinitionTemplatesFromWikis';

// Minimal workspace shape
const mockWorkspaces = [
  { id: 'w1', name: 'Main Wiki', active: true, isSubWiki: false, wikiFolderLocation: '/main/wiki' },
  { id: 'w2', name: 'Inactive Wiki', active: false, isSubWiki: false, wikiFolderLocation: '/inactive/wiki' },
];

const mockTiddlers = [
  { title: 'Template1', text: JSON.stringify({ foo: 'bar' }), caption: 'Tpl1', description: 'Desc1' },
  { title: 'BadTemplate', text: 'not-json', caption: 'Bad', description: 'BadDesc' },
];

describe('wikiTemplates helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('validateAndConvertWikiTiddlerToAgentTemplate should convert valid tiddler', () => {
    const converted = validateAndConvertWikiTiddlerToAgentTemplate(mockTiddlers[0] as unknown as ITiddlerFields, 'Main Wiki');
    expect(converted).toBeTruthy();
    expect(converted?.name).toBe('Tpl1');
  });

  it('getWikiAgentTemplates should query active workspaces and return templates', async () => {
    const mockWorkspaceService = {
      getWorkspacesAsList: vi.fn().mockResolvedValue(mockWorkspaces),
    } as unknown as { getWorkspacesAsList: () => Promise<unknown[]> };
    const mockWikiService = {
      wikiOperationInServer: vi.fn().mockImplementation(async (_channel: unknown, workspaceId: string) => {
        if (workspaceId === 'w1') return mockTiddlers;
        return [];
      }),
    } as unknown as { wikiOperationInServer: (channel: unknown, workspaceId: string, args?: unknown) => Promise<unknown> };

    vi.spyOn(container, 'get').mockImplementation((id: unknown) => {
      if (id === serviceIdentifier.Workspace) return mockWorkspaceService as unknown;
      if (id === serviceIdentifier.Wiki) return mockWikiService as unknown;
      throw new Error('unexpected');
    });

    const templates = await getWikiAgentTemplates();
    expect(templates.length).toBeGreaterThan(0);
    expect(mockWorkspaceService.getWorkspacesAsList).toHaveBeenCalled();
    expect(mockWikiService.wikiOperationInServer).toHaveBeenCalled();
  });
});
