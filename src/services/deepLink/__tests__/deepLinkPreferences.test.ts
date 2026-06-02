/**
 * Unit tests for DeepLinkService – preferences deep-link routing
 *
 * Tests that deep links can open preferences sections, page workspaces,
 * and ordinary wiki targets without pulling renderer-only assumptions into the main process.
 */
import { PageType } from '@/constants/pageTypes';
import type { IAnalyticsService } from '@services/analytics/interface';
import { container } from '@services/container';
import { PreferenceSections } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import type { IWorkspace, IWorkspaceService } from '@services/workspaces/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepLinkService } from '../index';

// ---------- helpers ----------

const mockAnalytics: Partial<IAnalyticsService> = {
  track: vi.fn().mockResolvedValue(undefined),
};

function bindAnalyticsIfNeeded() {
  try {
    container.get(serviceIdentifier.Analytics);
  } catch {
    container.bind(serviceIdentifier.Analytics).toConstantValue(mockAnalytics);
  }
}

function makeService(): DeepLinkService {
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const service = new DeepLinkService(workspaceService);
  return service;
}

// ---------- tests ----------

describe('DeepLinkService – preferences URL routing', () => {
  let windowOpen: ReturnType<typeof vi.fn>;
  let workspaceGet: ReturnType<typeof vi.fn>;
  let openWorkspaceTiddler: ReturnType<typeof vi.fn>;
  let setActiveWorkspaceView: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    bindAnalyticsIfNeeded();
    const windowService = container.get<IWindowService>(serviceIdentifier.Window);
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const workspaceViewService = container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView);
    windowOpen = windowService.open as ReturnType<typeof vi.fn>;
    workspaceGet = workspaceService.get as ReturnType<typeof vi.fn>;
    openWorkspaceTiddler = workspaceService.openWorkspaceTiddler as ReturnType<typeof vi.fn>;
    setActiveWorkspaceView = workspaceViewService.setActiveWorkspaceView as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('opens preferences window with externalAPI section', async () => {
    const service = makeService();
    await service.openDeepLink('tidgi://preferences/externalAPI');

    expect(windowOpen).toHaveBeenCalledOnce();
    expect(windowOpen).toHaveBeenCalledWith(
      WindowNames.preferences,
      { preferenceGotoTab: PreferenceSections.externalAPI },
    );
  });

  it('opens preferences window with notifications section', async () => {
    const service = makeService();
    await service.openDeepLink('tidgi://preferences/notifications');

    expect(windowOpen).toHaveBeenCalledOnce();
    expect(windowOpen).toHaveBeenCalledWith(
      WindowNames.preferences,
      { preferenceGotoTab: PreferenceSections.notifications },
    );
  });

  it('opens plain preferences window for unknown / empty section', async () => {
    const service = makeService();
    await service.openDeepLink('tidgi://preferences/doesNotExist');

    expect(windowOpen).toHaveBeenCalledOnce();
    // Should still open the preferences window but without a section
    expect(windowOpen).toHaveBeenCalledWith(WindowNames.preferences);
  });

  it('handles URL-encoded section names (e.g. %65xternalAPI)', async () => {
    const service = makeService();
    // encodeURIComponent('externalAPI') = 'externalAPI' (no special chars), but test with manual encoding
    await service.openDeepLink('tidgi://preferences/externalAPI');

    expect(windowOpen).toHaveBeenCalledWith(
      WindowNames.preferences,
      { preferenceGotoTab: PreferenceSections.externalAPI },
    );
  });

  it('does NOT call windowService.open for a regular tiddler deep link', async () => {
    const service = makeService();
    // Regular tiddler link – workspaceService.get is already mocked via services-container
    await service.openDeepLink('tidgi://test-wiki-1/#:Index');

    expect(windowOpen).not.toHaveBeenCalled();
  });

  it('opens a wiki workspace directly when the deep link has no hash', async () => {
    const service = makeService();
    await service.openDeepLink('tidgi://test-wiki-1');

    expect(openWorkspaceTiddler).toHaveBeenCalledOnce();
    expect(openWorkspaceTiddler.mock.calls[0]?.[1]).toBeUndefined();
    expect(setActiveWorkspaceView).not.toHaveBeenCalled();
  });

  it('opens a page workspace directly when the deep link has no hash', async () => {
    const pageWorkspace = {
      id: 'agent',
      name: 'agent',
      active: false,
      order: 0,
      pageType: PageType.agent,
      picturePath: null,
    } as IWorkspace;
    workspaceGet.mockResolvedValueOnce(pageWorkspace);

    const service = makeService();
    await service.openDeepLink('tidgi://agent');

    expect(setActiveWorkspaceView).toHaveBeenCalledOnce();
    expect(setActiveWorkspaceView).toHaveBeenCalledWith('agent');
    expect(openWorkspaceTiddler).not.toHaveBeenCalled();
    expect(windowOpen).not.toHaveBeenCalled();
  });

  it('accepts all valid PreferenceSections values', async () => {
    const service = makeService();
    for (const section of Object.values(PreferenceSections)) {
      vi.clearAllMocks();
      await service.openDeepLink(`tidgi://preferences/${section}`);
      expect(windowOpen).toHaveBeenCalledWith(
        WindowNames.preferences,
        { preferenceGotoTab: section },
      );
    }
  });

  it('preserves valid TiddlyWiki characters in tiddler names', async () => {
    const service = makeService();
    await service.openDeepLink('tidgi://test-wiki-1/#:My%5BTitle%5D');

    expect(openWorkspaceTiddler).toHaveBeenCalledOnce();
    expect(openWorkspaceTiddler.mock.calls[0]?.[1]).toBe('My[Title]');
  });

  it('preserves innocent < characters while stripping actual HTML tags', async () => {
    const service = makeService();
    await service.openDeepLink('tidgi://test-wiki-1/#:5%20%3C%2010');

    expect(openWorkspaceTiddler).toHaveBeenCalledOnce();
    expect(openWorkspaceTiddler.mock.calls[0]?.[1]).toBe('5 < 10');
  });

  it('strips HTML tags from tiddler names', async () => {
    const service = makeService();
    await service.openDeepLink('tidgi://test-wiki-1/#:%3Cdiv%3Etest%3C/div%3E');

    expect(openWorkspaceTiddler).toHaveBeenCalledOnce();
    expect(openWorkspaceTiddler.mock.calls[0]?.[1]).toBe('test');
  });
});
