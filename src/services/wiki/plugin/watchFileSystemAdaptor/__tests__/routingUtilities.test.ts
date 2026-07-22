/**
 * Unit tests for routingUtilities helpers used by FileSystemAdaptor and getTiddlerRoutingInfo.
 */
import type { IWikiWorkspace } from '@services/workspaces/interface';
import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS2459: TiddlyWiki uses exports.xxx style.
import { buildTiddlerRoutingInfo, explainTiddlerRouting, findTagTreePath, hasActiveSubWikiRouting, hasRoutingConfig, matchTiddlerToWorkspace } from '../routingUtilities';

const makeWiki = (tagMap: Record<string, string[]> = {}) => ({
  getTiddlersWithTag: vi.fn((tag: string) => tagMap[tag] ?? []),
  filterTiddlers: vi.fn(() => []),
  makeTiddlerIterator: vi.fn((titles: string[]) => titles),
});

describe('routingUtilities', () => {
  describe('hasRoutingConfig / hasActiveSubWikiRouting', () => {
    it('detects tagNames and filter routing configs', () => {
      expect(hasRoutingConfig({ tagNames: ['A'] } as unknown as IWikiWorkspace)).toBe(true);
      expect(hasRoutingConfig({
        tagNames: [],
        fileSystemPathFilterEnable: true,
        fileSystemPathFilter: '[tag[A]]',
      } as unknown as IWikiWorkspace)).toBe(true);
      expect(hasRoutingConfig({
        tagNames: [],
        fileSystemPathFilterEnable: false,
      } as unknown as IWikiWorkspace)).toBe(false);
    });

    it('requires a sub-wiki with routing for feature availability', () => {
      const mainId = 'main';
      const workspaces = [
        {
          id: mainId,
          name: 'main',
          isSubWiki: false,
          tagNames: ['Public'],
          includeTagTree: true,
        },
        {
          id: 'sub',
          name: 'private',
          isSubWiki: true,
          mainWikiID: mainId,
          tagNames: ['Private'],
          includeTagTree: true,
        },
      ] as unknown as IWikiWorkspace[];

      expect(hasActiveSubWikiRouting(workspaces, mainId)).toBe(true);
      expect(hasActiveSubWikiRouting([workspaces[0]], mainId)).toBe(false);
      expect(hasActiveSubWikiRouting([
        {
          ...workspaces[1],
          tagNames: [],
          fileSystemPathFilterEnable: false,
          fileSystemPathFilter: null,
        } as unknown as IWikiWorkspace,
      ], mainId)).toBe(false);
    });
  });

  describe('findTagTreePath', () => {
    it('returns path from root to descendant', () => {
      const wiki = makeWiki({
        Root: ['Mid'],
        Mid: ['Leaf'],
      }) as unknown as typeof $tw.wiki;

      expect(findTagTreePath('Root', 'Leaf', wiki)).toEqual(['Root', 'Mid', 'Leaf']);
      expect(findTagTreePath('Root', 'Missing', wiki)).toBeUndefined();
      expect(findTagTreePath('Root', 'Root', wiki)).toEqual(['Root']);
    });

    it('returns undefined when getTiddlersWithTag is unavailable', () => {
      const wiki = { filterTiddlers: vi.fn() } as unknown as typeof $tw.wiki;
      expect(findTagTreePath('Root', 'Leaf', wiki)).toBeUndefined();
    });
  });

  describe('explainTiddlerRouting / matchTiddlerToWorkspace / buildTiddlerRoutingInfo', () => {
    const main = {
      id: 'main',
      name: 'wiki',
      isSubWiki: false,
      mainWikiID: null,
      order: 0,
      tagNames: ['PublicRoot'],
      includeTagTree: true,
      fileSystemPathFilterEnable: false,
      fileSystemPathFilter: null,
      wikiFolderLocation: '/wiki',
    } as unknown as IWikiWorkspace;

    const sub = {
      id: 'sub',
      name: 'private-wiki',
      isSubWiki: true,
      mainWikiID: 'main',
      order: 1,
      tagNames: ['PrivateRoot'],
      includeTagTree: true,
      fileSystemPathFilterEnable: false,
      fileSystemPathFilter: null,
      wikiFolderLocation: '/private',
    } as unknown as IWikiWorkspace;

    let wiki: typeof $tw.wiki;
    let rootWidget: typeof $tw.rootWidget;

    beforeEach(() => {
      wiki = {
        getTiddlersWithTag: vi.fn((tag: string) => {
          if (tag === 'PublicRoot') return ['SharedMid'];
          if (tag === 'PrivateRoot') return ['SharedMid'];
          if (tag === 'SharedMid') return ['Child'];
          return [];
        }),
        filterTiddlers: vi.fn((_filter: string, widget: { tagName?: string }) => {
          const tagName = widget.tagName;
          if (tagName === 'PublicRoot' || tagName === 'PrivateRoot') {
            return ['Child'];
          }
          return [];
        }),
        makeTiddlerIterator: vi.fn((titles: string[]) => titles),
      } as unknown as typeof $tw.wiki;

      rootWidget = {
        makeFakeWidgetWithVariables: vi.fn((vars: { tagName: string }) => vars),
      } as unknown as typeof $tw.rootWidget;
    });

    it('explains tag-tree match with readable chain and respects workspace order', () => {
      const explanation = explainTiddlerRouting('Child', ['SharedMid'], [main, sub], wiki, rootWidget);
      expect(explanation?.workspace.id).toBe('main');
      expect(explanation?.kind).toBe('tag-tree');
      expect(explanation?.chain).toBe('PublicRoot → SharedMid → Child');
      expect(explanation?.rootTag).toBe('PublicRoot');

      expect(matchTiddlerToWorkspace('Child', ['SharedMid'], [main, sub], wiki, rootWidget)?.id).toBe('main');
    });

    it('prefers later workspace when earlier does not match', () => {
      wiki.filterTiddlers = vi.fn((_filter: string, widget: { tagName?: string }) => {
        return widget.tagName === 'PrivateRoot' ? ['Child'] : [];
      }) as typeof wiki.filterTiddlers;

      const explanation = explainTiddlerRouting('Child', ['SharedMid'], [main, sub], wiki, rootWidget);
      expect(explanation?.workspace.id).toBe('sub');
      expect(explanation?.chain).toBe('PrivateRoot → SharedMid → Child');
    });

    it('explains direct tag match', () => {
      wiki.filterTiddlers = vi.fn(() => []) as typeof wiki.filterTiddlers;

      const explanation = explainTiddlerRouting('Note', ['PrivateRoot'], [main, sub], wiki, rootWidget);
      expect(explanation?.kind).toBe('direct-tag');
      expect(explanation?.workspace.id).toBe('sub');
      expect(explanation?.chain).toBe('PrivateRoot → Note');
    });

    it('buildTiddlerRoutingInfo sets featureAvailable only with routed sub-wiki', () => {
      const withoutSub = buildTiddlerRoutingInfo('Child', ['SharedMid'], [main], 'main', wiki, rootWidget);
      expect(withoutSub.featureAvailable).toBe(false);
      expect(withoutSub.match).toBeUndefined();

      const withSub = buildTiddlerRoutingInfo('Child', ['SharedMid'], [main, sub], 'main', wiki, rootWidget);
      expect(withSub.featureAvailable).toBe(true);
      expect(withSub.match).toEqual(expect.objectContaining({
        workspaceId: 'main',
        workspaceName: 'wiki',
        isSubWiki: false,
        kind: 'tag-tree',
        chain: 'PublicRoot → SharedMid → Child',
      }));
    });

    it('explains filter matches', () => {
      const filterWorkspace = {
        ...sub,
        tagNames: [],
        includeTagTree: false,
        fileSystemPathFilterEnable: true,
        fileSystemPathFilter: '[prefix[$:/Deck/]]',
      } as unknown as IWikiWorkspace;

      wiki.filterTiddlers = vi.fn((filter: string) => filter.includes('prefix') ? ['$:/Deck/A'] : []) as typeof wiki.filterTiddlers;

      const explanation = explainTiddlerRouting('$:/Deck/A', [], [main, filterWorkspace], wiki, rootWidget);
      expect(explanation?.kind).toBe('filter');
      expect(explanation?.chain).toBe('[prefix[$:/Deck/]]');
      expect(explanation?.workspace.id).toBe('sub');
    });
  });
});
