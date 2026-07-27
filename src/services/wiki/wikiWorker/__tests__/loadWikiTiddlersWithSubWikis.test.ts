import type { IWikiWorkspace } from '@services/workspaces/interface';
import { describe, expect, it } from 'vitest';
import { buildWorkspaceSaveFilter, createDynamicStoreFilesInfo } from '../loadWikiTiddlersWithSubWikis';

function workspace(overrides: Partial<IWikiWorkspace> & Pick<IWikiWorkspace, 'id' | 'wikiFolderLocation'>): IWikiWorkspace {
  return {
    enableFileSystemWatch: true,
    fileSystemPathFilter: null,
    fileSystemPathFilterEnable: false,
    ignoreSymlinks: true,
    includeTagTree: false,
    order: 0,
    tagNames: [],
    ...overrides,
  } as IWikiWorkspace;
}

describe('dynamic store workspace configuration', () => {
  it('compiles direct, tag-tree and custom routing into save filters', () => {
    const filter = buildWorkspaceSaveFilter(workspace({
      id: 'sub',
      wikiFolderLocation: '/wiki/sub',
      tagNames: ['Root Tag'],
      includeTagTree: true,
      fileSystemPathFilterEnable: true,
      fileSystemPathFilter: '[has[public]]\n[prefix[$:/Deck/]]',
    }));

    expect(filter).toContain('[title[Root Tag]]');
    expect(filter).toContain('[tag[Root Tag]]');
    expect(filter).toContain('[in-tagtree-of:inclusive[Root Tag]]');
    expect(filter).not.toContain('draft.of');
    expect(filter).toContain('[has[public]] [prefix[$:/Deck/]]');
  });

  it('maps ordered workspaces to upstream dynamic stores without duplicating the main workspace', () => {
    const main = workspace({
      id: 'main',
      wikiFolderLocation: '/wiki/main',
      order: 10,
    });
    const sub = workspace({
      id: 'sub',
      wikiFolderLocation: '/wiki/sub',
      order: 1,
      tagNames: ['SubTag'],
      ignoreSymlinks: false,
    });

    const filesInfo = createDynamicStoreFilesInfo({
      homePath: '/wiki/main',
      mainWorkspace: main,
      readOnly: false,
      // Flat-workspace callers historically included main in this list.
      subWikis: [main, sub],
      useWikiFolderAsTiddlersPath: true,
    });

    expect(filesInfo.directories).toHaveLength(2);
    expect(filesInfo.directories[0].path).toBe('/wiki/sub');
    expect(filesInfo.directories[0].dynamicStore).toMatchObject({
      followSymlinks: true,
      reselectOnSave: true,
      saveFilter: expect.stringContaining('[tag[SubTag]]'),
      watch: true,
      watcherProvider: 'tidgi-nsfw',
    });
    expect(filesInfo.directories[1].path).toBe('/wiki/main');
    expect(filesInfo.directories[1].dynamicStore.ignoredPathRegExp).toContain('tiddlywiki');
    expect(filesInfo.directories[1].dynamicStore.externalAttachments).toEqual({
      basePath: '/wiki/main',
      moveOnRoute: true,
      pathPrefix: 'files',
    });
  });

  it('uses the configured tiddler location for a normal wiki and disables read-only watchers', () => {
    const main = workspace({
      id: 'main',
      wikiFolderLocation: '/wiki/main',
    });
    const filesInfo = createDynamicStoreFilesInfo({
      homePath: '/wiki/main',
      mainWorkspace: main,
      readOnly: true,
      subWikis: [],
      useWikiFolderAsTiddlersPath: false,
    });

    expect(filesInfo.directories[0].path).toBe('.');
    expect(filesInfo.directories[0].dynamicStore.watch).toBe(false);
  });
});
