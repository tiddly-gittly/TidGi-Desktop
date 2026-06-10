import { container } from '@services/container';
import serviceIdentifier from '@services/serviceIdentifier';
import { WindowNames } from '@services/windows/WindowProperties';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callTool, TOOLS } from '../tools';

const mockGet = vi.fn();
const mockOpen = vi.fn();
const mockClose = vi.fn();

function createSnapshotWindowMock(snapshot: unknown) {
  return {
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    getTitle: vi.fn(() => 'TidGi [Snapshot]'),
    webContents: {
      isDestroyed: vi.fn(() => false),
      debugger: {
        isAttached: vi.fn(() => false),
        attach: vi.fn(),
        detach: vi.fn(),
        sendCommand: vi.fn(async () => snapshot),
      },
    },
  };
}

function createBrowserWindowMock(overrides: Partial<{ destroyed: boolean; visible: boolean; title: string }> = {}) {
  const { destroyed = false, visible = true, title = 'TidGi Window' } = overrides;
  return {
    isDestroyed: vi.fn(() => destroyed),
    isVisible: vi.fn(() => visible),
    getTitle: vi.fn(() => title),
  };
}

describe('MCP tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (container.isBound(serviceIdentifier.Window)) {
      container.unbind(serviceIdentifier.Window);
    }

    container.bind(serviceIdentifier.Window).toConstantValue({
      get: mockGet,
      open: mockOpen,
      close: mockClose,
    });
  });

  afterEach(() => {
    if (container.isBound(serviceIdentifier.Window)) {
      container.unbind(serviceIdentifier.Window);
    }
  });

  it('exposes ui_window in MCP tool definitions', () => {
    expect(TOOLS.some(tool => tool.name === 'ui_window')).toBe(true);
  });

  it('lists app windows and MCP target aliases', async () => {
    mockGet.mockImplementation((windowName: WindowNames) => {
      if (windowName === WindowNames.main) {
        return createBrowserWindowMock({ title: 'TidGi [App]' });
      }

      return undefined;
    });

    const result = await callTool('ui_window', { action: 'list' }) as {
      targetAliases: Record<string, string>;
      windows: Array<{ windowName: WindowNames; target: string | null; isOpen: boolean; isVisible: boolean; title: string | null }>;
    };

    expect(result.targetAliases).toEqual({
      'main-window': 'main',
      'preferences-window': 'preferences',
    });
    expect(result.windows).toContainEqual(expect.objectContaining({
      windowName: WindowNames.main,
      target: 'main-window',
      isOpen: true,
      isVisible: true,
      title: 'TidGi [App]',
    }));
    expect(result.windows).toContainEqual(expect.objectContaining({
      windowName: WindowNames.preferences,
      target: 'preferences-window',
      isOpen: false,
      isVisible: false,
      title: null,
    }));
  });

  it('opens a window by MCP target alias', async () => {
    mockOpen.mockResolvedValue(undefined);
    mockGet.mockImplementation((windowName: WindowNames) => {
      if (windowName === WindowNames.preferences) {
        return createBrowserWindowMock({ title: 'TidGi [Preferences]' });
      }

      return undefined;
    });

    const result = await callTool('ui_window', {
      action: 'open',
      window: 'preferences-window',
      meta: { preferenceGotoTab: 'notifications' },
      recreate: true,
    }) as { windowName: WindowNames; target: string | null; isOpen: boolean };

    expect(mockOpen).toHaveBeenCalledWith(
      WindowNames.preferences,
      { preferenceGotoTab: 'notifications' },
      { recreate: true },
    );
    expect(result).toEqual(expect.objectContaining({
      windowName: WindowNames.preferences,
      target: 'preferences-window',
      isOpen: true,
    }));
  });

  it('closes a window by internal window name', async () => {
    mockClose.mockResolvedValue(undefined);

    const result = await callTool('ui_window', {
      action: 'close',
      window: 'preferences',
    }) as { success: boolean; windowName: WindowNames; target: string | null; isOpen: boolean };

    expect(mockClose).toHaveBeenCalledWith(WindowNames.preferences);
    expect(result).toEqual({
      success: true,
      windowName: WindowNames.preferences,
      target: 'preferences-window',
      isOpen: false,
    });
  });

  it('returns a structural summary for oversized snapshots', async () => {
    mockGet.mockReturnValue(createSnapshotWindowMock({
      nodes: Array.from({ length: 120 }, (_, index) => ({ nodeId: String(index), name: `node-${index}`, childIds: [index + 1] })),
      metadata: { title: 'Preferences' },
    }));

    const result = await callTool('ui_snapshot', {
      workspaceId: 'main-window',
      maxBytes: 500,
    }) as {
      truncated: boolean;
      path: string;
      children: Array<{ key: string; path: string; serializedBytes: number }>;
    };

    expect(result.truncated).toBe(true);
    expect(result.path).toBe('root');
    expect(result.children).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'nodes', path: 'nodes' }),
      expect.objectContaining({ key: 'metadata', path: 'metadata' }),
    ]));
  });

  it('supports drilling into an oversized array snapshot with slices', async () => {
    mockGet.mockReturnValue(createSnapshotWindowMock({
      nodes: Array.from({ length: 80 }, (_, index) => ({ nodeId: String(index), text: `node-${index}` })),
    }));

    const result = await callTool('ui_snapshot', {
      workspaceId: 'main-window',
      path: 'nodes',
      sliceStart: 10,
      sliceCount: 5,
      maxBytes: 10_000,
    }) as Array<{ nodeId: string; text: string }>;

    expect(result).toHaveLength(5);
    expect(result[0]).toEqual({ nodeId: '10', text: 'node-10' });
    expect(result[4]).toEqual({ nodeId: '14', text: 'node-14' });
  });
});
