import { container } from '@services/container';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IViewService } from '@services/view/interface';
import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { z } from 'zod';
import type { McpToolDefinition, ToolInput } from './types';

/** Pass this as workspaceId to target the main React UI window instead of a wiki webview. */
const MAIN_WINDOW_TARGET = 'main-window';
const PREFERENCES_WINDOW_TARGET = 'preferences-window';

const WINDOW_TARGETS = new Map<string, WindowNames>([
  [MAIN_WINDOW_TARGET, WindowNames.main],
  [PREFERENCES_WINDOW_TARGET, WindowNames.preferences],
]);

const TARGET_WINDOW_NAMES = new Map<WindowNames, string>(
  Array.from(WINDOW_TARGETS, ([target, windowName]) => [windowName, target]),
);

const APP_WINDOW_NAMES = Object.values(WindowNames);
const DEFAULT_SNAPSHOT_MAX_BYTES = 48 * 1024;
const DEFAULT_SNAPSHOT_ARRAY_SLICE_COUNT = 50;
const MAX_SNAPSHOT_SUMMARY_CHILDREN = 25;

type SnapshotPathSegment = string | number;

interface SnapshotSummaryChild {
  key: string;
  path: string;
  valueType: string;
  serializedBytes: number;
  childCount: number | null;
}

interface SnapshotSummary {
  truncated: true;
  path: string;
  valueType: string;
  serializedBytes: number;
  maxBytes: number;
  childCount: number | null;
  arraySlice?: {
    start: number;
    count: number;
    total: number;
    applied: boolean;
  };
  children?: SnapshotSummaryChild[];
  preview?: string;
}

function resolveWindowName(window: string): WindowNames {
  if (WINDOW_TARGETS.has(window)) {
    return WINDOW_TARGETS.get(window)!;
  }

  if (APP_WINDOW_NAMES.includes(window as WindowNames)) {
    return window as WindowNames;
  }

  throw new Error(
    `Unknown window: ${window}. Use one of: ${[...WINDOW_TARGETS.keys(), ...APP_WINDOW_NAMES].join(', ')}`,
  );
}

function getWindowState(windowService: IWindowService, windowName: WindowNames) {
  const win = windowService.get(windowName);
  const isOpen = !!win && !win.isDestroyed();

  return {
    windowName,
    target: TARGET_WINDOW_NAMES.get(windowName) ?? null,
    isOpen,
    isVisible: isOpen ? win.isVisible() : false,
    title: isOpen ? win.getTitle() : null,
  };
}

function getOpenConfig(input: {
  multiple?: boolean;
  recreate?: boolean;
  recreateUnlessWorkspaceID?: string;
}) {
  const { multiple, recreate, recreateUnlessWorkspaceID } = input;
  if (multiple === undefined && recreate === undefined && recreateUnlessWorkspaceID === undefined) {
    return undefined;
  }

  return {
    ...(multiple === undefined ? {} : { multiple }),
    ...(recreate === undefined ? {} : { recreate }),
    ...(recreateUnlessWorkspaceID === undefined ? {} : { recreateUnlessWorkspaceID }),
  };
}

function getSnapshotValueType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function getSnapshotChildCount(value: unknown): number | null {
  if (Array.isArray(value)) {
    return value.length;
  }

  if (value !== null && typeof value === 'object') {
    return Object.keys(value).length;
  }

  return null;
}

function getSerializedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function formatSnapshotPath(pathSegments: SnapshotPathSegment[]): string {
  if (pathSegments.length === 0) {
    return 'root';
  }

  return pathSegments.reduce<string>((path, segment) => {
    if (typeof segment === 'number') {
      return `${path}[${segment}]`;
    }

    return path === '' ? segment : `${path}.${segment}`;
  }, '');
}

function parseSnapshotPath(path: string | undefined): SnapshotPathSegment[] {
  if (!path) {
    return [];
  }

  return path
    .split('.')
    .filter(segment => segment.length > 0)
    .flatMap((segment) => {
      const parts: SnapshotPathSegment[] = [];
      const pattern = /([^[]+)|(\[(\d+)\])/g;
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(segment)) !== null) {
        if (match[1]) {
          parts.push(match[1]);
        } else if (match[3]) {
          parts.push(Number(match[3]));
        }
      }

      return parts;
    });
}

function getSnapshotValueAtPath(root: unknown, pathSegments: SnapshotPathSegment[]): unknown {
  let current = root;

  for (const segment of pathSegments) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) {
        throw new Error(`Snapshot path ${formatSnapshotPath(pathSegments)} expected an array before index ${segment}.`);
      }
      current = current[segment];
    } else {
      if (current === null || typeof current !== 'object' || !(segment in current)) {
        throw new Error(`Snapshot path ${formatSnapshotPath(pathSegments)} not found.`);
      }
      current = (current as Record<string, unknown>)[segment];
    }
  }

  return current;
}

function createSnapshotSummaryChild(key: string, pathSegments: SnapshotPathSegment[], value: unknown): SnapshotSummaryChild {
  return {
    key,
    path: formatSnapshotPath(pathSegments),
    valueType: getSnapshotValueType(value),
    serializedBytes: getSerializedBytes(value),
    childCount: getSnapshotChildCount(value),
  };
}

function summarizeSnapshotValue(
  value: unknown,
  pathSegments: SnapshotPathSegment[],
  maxBytes: number,
  arraySlice: { start: number; count: number; total: number; applied: boolean } | undefined,
): SnapshotSummary {
  const summary: SnapshotSummary = {
    truncated: true,
    path: formatSnapshotPath(pathSegments),
    valueType: getSnapshotValueType(value),
    serializedBytes: getSerializedBytes(value),
    maxBytes,
    childCount: getSnapshotChildCount(value),
  };

  if (arraySlice) {
    summary.arraySlice = arraySlice;
  }

  if (Array.isArray(value)) {
    const total = value.length;
    const chunkSize = arraySlice?.count ?? DEFAULT_SNAPSHOT_ARRAY_SLICE_COUNT;
    const children: SnapshotSummaryChild[] = [];

    for (let start = 0; start < total && children.length < MAX_SNAPSHOT_SUMMARY_CHILDREN; start += chunkSize) {
      const end = Math.min(start + chunkSize, total);
      children.push(createSnapshotSummaryChild(`${start}-${end - 1}`, [...pathSegments, `${start}:${end - 1}`], value.slice(start, end)));
    }

    summary.children = children;
    return summary;
  }

  if (value !== null && typeof value === 'object') {
    summary.children = Object.entries(value)
      .slice(0, MAX_SNAPSHOT_SUMMARY_CHILDREN)
      .map(([key, childValue]) => createSnapshotSummaryChild(key, [...pathSegments, key], childValue));
    return summary;
  }

  summary.preview = typeof value === 'string' ? value.slice(0, 500) : String(value);
  return summary;
}

function selectSnapshotValue(
  root: unknown,
  options: { path?: string; sliceStart?: number; sliceCount?: number },
): {
  value: unknown;
  pathSegments: SnapshotPathSegment[];
  arraySlice?: { start: number; count: number; total: number; applied: boolean };
} {
  const pathSegments = parseSnapshotPath(options.path);
  const selectedValue = getSnapshotValueAtPath(root, pathSegments);

  if (!Array.isArray(selectedValue)) {
    return { value: selectedValue, pathSegments };
  }

  if (options.sliceStart === undefined && options.sliceCount === undefined) {
    return {
      value: selectedValue,
      pathSegments,
      arraySlice: {
        start: 0,
        count: DEFAULT_SNAPSHOT_ARRAY_SLICE_COUNT,
        total: selectedValue.length,
        applied: false,
      },
    };
  }

  const sliceStart = options.sliceStart ?? 0;
  const sliceCount = options.sliceCount ?? DEFAULT_SNAPSHOT_ARRAY_SLICE_COUNT;
  return {
    value: selectedValue.slice(sliceStart, sliceStart + sliceCount),
    pathSegments,
    arraySlice: {
      start: sliceStart,
      count: sliceCount,
      total: selectedValue.length,
      applied: true,
    },
  };
}

// ─── Tool Definitions ─────────────────────────────────────────────────────────

export const TOOLS: McpToolDefinition[] = [
  // ── UI interaction (like Chrome DevTools Protocol) ────────────────────────
  {
    name: 'ui_window',
    description:
      'List, open, or close app windows. Use this to open windows like Preferences before targeting them with other UI tools. Accepts either MCP targets such as "main-window" / "preferences-window" or internal window names such as "preferences" / "notifications".',
    inputSchema: {
      action: z.enum(['list', 'open', 'close']).describe('Window action to perform.'),
      window: z.string().optional().describe('Required for open/close. Supports MCP targets like "main-window" / "preferences-window" or window names like "preferences".'),
      meta: z.record(z.string(), z.unknown()).optional().describe('Optional window metadata to pass when opening a window.'),
      multiple: z.boolean().optional().describe('Allow multiple windows with the same name when opening.'),
      recreate: z.boolean().optional().describe('Recreate the window if it is already open.'),
      recreateUnlessWorkspaceID: z.string().optional().describe('Recreate the window unless its stored workspaceID already matches this value.'),
    },
  },
  {
    name: 'ui_snapshot',
    description:
      'Get a DOM/text snapshot: page title, URL, visible text, interactive elements with center coordinates, and links. workspaceId targets a wiki webview; use "main-window" for the main React UI or "preferences-window" for Settings. For oversized results, the tool returns a structural summary and supports drilling into a path or array slice.',
    inputSchema: {
      workspaceId: z.string().optional().describe('Workspace ID, or "main-window" / "preferences-window" for app windows. Omit to use active workspace.'),
      path: z.string().optional().describe('Optional dot path into the snapshot result, for example "nodes" or "nodes[0].childIds".'),
      sliceStart: z.number().optional().describe('Optional start index when the selected path points to an array.'),
      sliceCount: z.number().optional().describe('Optional number of array items to return from the selected path.'),
      maxBytes: z.number().optional().describe('Maximum serialized JSON size before the result is summarized. Default: 49152 bytes.'),
    },
  },
  {
    name: 'ui_screenshot',
    description:
      'Take a screenshot. workspaceId targets a wiki webview; use "main-window" for the main React UI or "preferences-window" for Settings. Omit to use active workspace. Returns base64-encoded PNG.',
    inputSchema: {
      workspaceId: z.string().optional().describe('Workspace ID, or "main-window" / "preferences-window" for app windows. Omit to use active workspace.'),
    },
  },
  {
    name: 'ui_click',
    description: 'Click at (x, y). workspaceId targets a wiki webview; use "main-window" for the main React UI or "preferences-window" for Settings. Omit to use active workspace.',
    inputSchema: {
      x: z.number().describe('X coordinate (pixels from left)'),
      y: z.number().describe('Y coordinate (pixels from top)'),
      workspaceId: z.string().optional().describe('Workspace ID, or "main-window" / "preferences-window" for app windows. Omit to use active workspace.'),
      button: z.enum(['left', 'right', 'middle']).optional().describe('Mouse button (default: left)'),
      clickCount: z.number().optional().describe('Number of clicks: 1=single, 2=double. Default: 1.'),
    },
  },
  {
    name: 'ui_type',
    description: 'Type text into the currently focused element. workspaceId targets a wiki webview; use "main-window" for the main React UI or "preferences-window" for Settings.',
    inputSchema: {
      text: z.string().describe('Text to type'),
      workspaceId: z.string().optional().describe('Workspace ID, or "main-window" / "preferences-window" for app windows. Omit to use active workspace.'),
    },
  },
  {
    name: 'ui_key',
    description: 'Press a keyboard key or shortcut, e.g. "Enter", "Escape", "Control+s". Use "main-window" or "preferences-window" to target app windows.',
    inputSchema: {
      key: z.string().describe('Key name or combo, e.g. "Enter", "Tab", "Control+s"'),
      workspaceId: z.string().optional().describe('Workspace ID, or "main-window" / "preferences-window" for app windows. Omit to use active workspace.'),
    },
  },
  {
    name: 'ui_navigate',
    description: 'Navigate the workspace webview to a URL, e.g. "tidgi://workspaceId/#TiddlerTitle". Only works for wiki webviews, not "main-window".',
    inputSchema: {
      url: z.string().describe('URL to load'),
      workspaceId: z.string().optional().describe('Workspace ID. Omit to use active workspace.'),
    },
  },
  {
    name: 'ui_evaluate',
    description:
      'Evaluate JavaScript and return the result. In wiki webviews, $tw.wiki API is available. Use "main-window" or "preferences-window" to query app window state (window.service, React state, etc.).',
    inputSchema: {
      script: z.string().describe('JavaScript to evaluate. The last expression value is returned.'),
      workspaceId: z.string().optional().describe('Workspace ID, or "main-window" / "preferences-window" for app windows. Omit to use active workspace.'),
    },
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => {
        reject(new Error(`${label} timed out after ${ms}ms`));
      }, ms)
    ),
  ]);
}

async function getWebContents(workspaceId: string | undefined) {
  // Special targets: app windows like main or preferences.
  if (workspaceId && WINDOW_TARGETS.has(workspaceId)) {
    const windowService = container.get<IWindowService>(serviceIdentifier.Window);
    const windowName = WINDOW_TARGETS.get(workspaceId)!;
    const win = windowService.get(windowName);
    if (!win) throw new Error(`${workspaceId} not found.`);
    const { webContents } = win;
    if (webContents.isDestroyed()) throw new Error(`${workspaceId} webContents is destroyed.`);
    return { webContents, wsId: workspaceId };
  }

  // Wiki webview target
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const viewService = container.get<IViewService>(serviceIdentifier.View);

  let wsId = workspaceId;
  if (!wsId) {
    const active = await workspaceService.getActiveWorkspace();
    if (!active) throw new Error('No active workspace.');
    wsId = active.id;
  }
  const view = viewService.getView(wsId, WindowNames.main);
  if (!view) throw new Error(`No view found for workspace ${wsId}. It may not be loaded yet.`);
  const { webContents } = view;
  if (webContents.isDestroyed()) throw new Error(`WebContents for workspace ${wsId} is destroyed.`);
  return { webContents, wsId };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function callTool(name: string, input: ToolInput): Promise<unknown> {
  switch (name) {
    // ── UI interaction ────────────────────────────────────────────────────
    case 'ui_window': {
      const { action, window, meta, multiple, recreate, recreateUnlessWorkspaceID } = input as {
        action: 'list' | 'open' | 'close';
        window?: string;
        meta?: Record<string, unknown>;
        multiple?: boolean;
        recreate?: boolean;
        recreateUnlessWorkspaceID?: string;
      };
      const windowService = container.get<IWindowService>(serviceIdentifier.Window);

      if (action === 'list') {
        return {
          targetAliases: Object.fromEntries(WINDOW_TARGETS),
          windows: APP_WINDOW_NAMES.map(windowName => getWindowState(windowService, windowName)),
        };
      }

      if (!window) {
        throw new Error(`window is required for ui_window action "${action}".`);
      }

      const windowName = resolveWindowName(window);

      if (action === 'open') {
        await windowService.open(windowName, meta, getOpenConfig({ multiple, recreate, recreateUnlessWorkspaceID }));
        return getWindowState(windowService, windowName);
      }

      await windowService.close(windowName);
      return {
        success: true,
        windowName,
        target: TARGET_WINDOW_NAMES.get(windowName) ?? null,
        isOpen: false,
      };
    }

    case 'ui_snapshot': {
      const { workspaceId, path, sliceStart, sliceCount, maxBytes = DEFAULT_SNAPSHOT_MAX_BYTES } = input as {
        workspaceId?: string;
        path?: string;
        sliceStart?: number;
        sliceCount?: number;
        maxBytes?: number;
      };
      const { webContents } = await getWebContents(workspaceId);
      if (!webContents.debugger.isAttached()) webContents.debugger.attach('1.3');
      try {
        const result = (await withTimeout(
          webContents.debugger.sendCommand('Accessibility.getFullAXTree', {}),
          10_000,
          'ui_snapshot',
        )) as unknown;
        const selected = selectSnapshotValue(result, { path, sliceStart, sliceCount });
        if (getSerializedBytes(selected.value) <= maxBytes) {
          return selected.value;
        }

        return summarizeSnapshotValue(selected.value, selected.pathSegments, maxBytes, selected.arraySlice);
      } finally {
        if (webContents.debugger.isAttached()) webContents.debugger.detach();
      }
    }

    case 'ui_screenshot': {
      const { workspaceId } = input as { workspaceId?: string };
      const { webContents } = await getWebContents(workspaceId);
      const image = await withTimeout(webContents.capturePage(), 10_000, 'ui_screenshot');
      return { mimeType: 'image/png', base64: image.toPNG().toString('base64') };
    }

    case 'ui_click': {
      const { workspaceId, x, y, button = 'left', clickCount = 1 } = input as {
        workspaceId?: string;
        x: number;
        y: number;
        button?: 'left' | 'right' | 'middle';
        clickCount?: number;
      };
      const { webContents } = await getWebContents(workspaceId);
      for (let index = 0; index < clickCount; index++) {
        webContents.sendInputEvent({ type: 'mouseDown', x, y, button, clickCount });
        webContents.sendInputEvent({ type: 'mouseUp', x, y, button, clickCount });
      }
      return { success: true, x, y };
    }

    case 'ui_type': {
      const { workspaceId, text } = input as { workspaceId?: string; text: string };
      const { webContents } = await getWebContents(workspaceId);
      await webContents.insertText(text);
      return { success: true, length: text.length };
    }

    case 'ui_key': {
      const { workspaceId, key } = input as { workspaceId?: string; key: string };
      const { webContents } = await getWebContents(workspaceId);
      const parts = key.split('+');
      const mainKey = parts.at(-1) ?? key;
      const modifierMap: Record<string, 'shift' | 'control' | 'alt' | 'meta'> = {
        shift: 'shift',
        ctrl: 'control',
        control: 'control',
        alt: 'alt',
        option: 'alt',
        meta: 'meta',
        cmd: 'meta',
        command: 'meta',
      };
      const modifiers = parts
        .slice(0, -1)
        .map(m => modifierMap[m.toLowerCase()])
        .filter((m): m is 'shift' | 'control' | 'alt' | 'meta' => m !== undefined);
      webContents.sendInputEvent({ type: 'keyDown', keyCode: mainKey, modifiers });
      webContents.sendInputEvent({ type: 'keyUp', keyCode: mainKey, modifiers });
      return { success: true, key };
    }

    case 'ui_navigate': {
      const { workspaceId, url } = input as { workspaceId?: string; url: string };
      const { webContents } = await getWebContents(workspaceId);
      await withTimeout(webContents.loadURL(url), 15_000, 'ui_navigate');
      return { success: true, url };
    }

    case 'ui_evaluate': {
      const { workspaceId, script } = input as { workspaceId?: string; script: string };
      const { webContents } = await getWebContents(workspaceId);
      // Wrap in async IIFE so:
      // 1. SyntaxErrors are caught by the outer try/catch inside the string (they surface as rejects from executeJavaScript)
      // 2. Runtime errors are returned as structured { ok, error } so the AI can read them
      const wrapped = `(async () => {
  try {
    const __r = await (async function __eval() { ${script} })();
    return JSON.stringify({ ok: true, value: __r === undefined ? null : __r });
  } catch (e) {
    return JSON.stringify({ ok: false, error: (e && e.message) ? e.message : String(e), stack: (e && e.stack) ? String(e.stack) : '' });
  }
})()`;
      let raw: { ok: boolean; value?: unknown; error?: string; stack?: string };
      try {
        const json = await withTimeout(
          webContents.executeJavaScript(wrapped, true),
          15_000,
          'ui_evaluate',
        ) as string;
        raw = JSON.parse(json) as typeof raw;
      } catch (execError) {
        // SyntaxError at parse time — extract message from Electron's error object
        const message = execError instanceof Error
          ? execError.message
          : (typeof execError === 'object' && execError !== null && 'message' in execError)
          ? String((execError as Record<string, unknown>).message)
          : String(execError);
        throw new Error(`ui_evaluate syntax/execution error: ${message}`);
      }
      if (!raw.ok) {
        // Redact absolute file paths from the stack before returning to avoid leaking local paths
        const redactedStack = (raw.stack ?? '')
          .replace(/[A-Za-z]:\\[\s\S]*?(?=\n|\s{2,}|$)/gi, '<redacted>')
          .replace(/\/(?:Users|home)\/[\s\S]*?(?=\n|\s{2,}|$)/g, '<redacted>');
        throw new Error(`ui_evaluate script error: ${raw.error ?? '(unknown)'}\n${redactedStack}`);
      }
      return raw.value;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
