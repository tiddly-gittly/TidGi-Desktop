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
      executeJavaScript: vi.fn(async () => snapshot),
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

function createInputWindowMock() {
  const sendInputEvent = vi.fn();
  const insertText = vi.fn(async () => undefined);
  const webContents = {
    isDestroyed: vi.fn(() => false),
    focus: vi.fn(),
    sendInputEvent,
    insertText,
  };
  const browserWindow = {
    isDestroyed: vi.fn(() => false),
    isFocused: vi.fn(() => false),
    focus: vi.fn(),
    isVisible: vi.fn(() => true),
    getTitle: vi.fn(() => 'TidGi [Input]'),
    webContents,
  };
  return { browserWindow, webContents, sendInputEvent, insertText };
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
    const target = createSnapshotWindowMock({
      nodes: Array.from({ length: 120 }, (_, index) => ({ nodeId: String(index), name: `node-${index}`, childIds: [index + 1] })),
      metadata: { title: 'Preferences' },
    });
    mockGet.mockReturnValue(target);

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
    expect(target.webContents.executeJavaScript).toHaveBeenCalledTimes(1);
    expect(target.webContents.debugger.attach).not.toHaveBeenCalled();
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

  it('supports drilling into array ranges returned by snapshot summaries', async () => {
    mockGet.mockReturnValue(createSnapshotWindowMock({
      nodes: Array.from({ length: 80 }, (_, index) => ({ nodeId: String(index), text: `node-${index}` })),
    }));

    const result = await callTool('ui_snapshot', {
      workspaceId: 'main-window',
      path: 'nodes.10:14',
      maxBytes: 10_000,
    }) as Array<{ nodeId: string; text: string }>;

    expect(result).toHaveLength(5);
    expect(result[0]).toEqual({ nodeId: '10', text: 'node-10' });
    expect(result[4]).toEqual({ nodeId: '14', text: 'node-14' });
  });

  it('fails fast after a renderer command times out instead of queuing another command', async () => {
    vi.useFakeTimers();
    let settleSnapshot: ((snapshot: unknown) => void) | undefined;
    const target = createSnapshotWindowMock(undefined);
    target.webContents.executeJavaScript.mockImplementationOnce(() =>
      new Promise((resolve) => {
        settleSnapshot = resolve;
      })
    );
    mockGet.mockReturnValue(target);

    const timedOutSnapshot = callTool('ui_snapshot', { workspaceId: 'main-window' });
    const timeoutExpectation = expect(timedOutSnapshot).rejects.toThrow('ui_snapshot timed out after 10000ms');
    await vi.advanceTimersByTimeAsync(10_000);
    await timeoutExpectation;

    await expect(callTool('ui_evaluate', {
      workspaceId: 'main-window',
      script: '1 + 1',
    })).rejects.toThrow('ui_snapshot is still running');
    expect(target.webContents.executeJavaScript).toHaveBeenCalledTimes(1);

    settleSnapshot?.({ title: 'Recovered' });
    await vi.advanceTimersByTimeAsync(0);
    target.webContents.executeJavaScript.mockResolvedValueOnce(JSON.stringify({ ok: true, value: 2 }));

    await expect(callTool('ui_evaluate', {
      workspaceId: 'main-window',
      script: '1 + 1',
    })).resolves.toBe(2);
    vi.useRealTimers();
  });

  it('focuses the target before clicking so modal controls receive the pointer event', async () => {
    const target = createInputWindowMock();
    mockGet.mockReturnValue(target.browserWindow);

    await callTool('ui_click', {
      workspaceId: 'main-window',
      x: 240,
      y: 180,
    });

    expect(target.browserWindow.focus).toHaveBeenCalledTimes(1);
    expect(target.webContents.focus).toHaveBeenCalledTimes(1);
    expect(target.sendInputEvent.mock.calls).toEqual([
      [{ type: 'mouseMove', x: 240, y: 180 }],
      [{ type: 'mouseDown', x: 240, y: 180, button: 'left', clickCount: 1 }],
      [{ type: 'mouseUp', x: 240, y: 180, button: 'left', clickCount: 1 }],
    ]);
  });

  it('focuses before typing into a dialog field and waits for insertion', async () => {
    const target = createInputWindowMock();
    mockGet.mockReturnValue(target.browserWindow);

    const result = await callTool('ui_type', {
      workspaceId: 'main-window',
      text: 'draft value',
    });

    expect(target.browserWindow.focus).toHaveBeenCalledTimes(1);
    expect(target.webContents.focus).toHaveBeenCalledTimes(1);
    expect(target.insertText).toHaveBeenCalledWith('draft value');
    expect(result).toEqual({ success: true, length: 11 });
  });

  it('normalizes keyboard aliases and printable keys for dialog activation', async () => {
    const target = createInputWindowMock();
    mockGet.mockReturnValue(target.browserWindow);

    await callTool('ui_key', {
      workspaceId: 'main-window',
      key: 'Control+s',
    });
    await callTool('ui_key', {
      workspaceId: 'main-window',
      key: 'Esc',
    });

    expect(target.browserWindow.focus).toHaveBeenCalledTimes(2);
    expect(target.webContents.focus).toHaveBeenCalledTimes(2);
    expect(target.sendInputEvent.mock.calls).toEqual([
      [{ type: 'keyDown', keyCode: 'S', modifiers: ['control'] }],
      [{ type: 'keyUp', keyCode: 'S', modifiers: ['control'] }],
      [{ type: 'keyDown', keyCode: 'Escape', modifiers: [] }],
      [{ type: 'keyUp', keyCode: 'Escape', modifiers: [] }],
    ]);
  });

  it('rejects ui_navigate for app window targets', async () => {
    await expect(callTool('ui_navigate', {
      workspaceId: 'main-window',
      url: 'https://example.com',
    })).rejects.toThrow('ui_navigate does not support app window target "main-window"');

    await expect(callTool('ui_navigate', {
      workspaceId: 'preferences-window',
      url: 'https://example.com',
    })).rejects.toThrow('ui_navigate does not support app window target "preferences-window"');
  });
});
