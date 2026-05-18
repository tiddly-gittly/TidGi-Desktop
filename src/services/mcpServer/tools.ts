import { container } from '@services/container';
import type { IViewService } from '@services/view/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWorkspaceService } from '@services/workspaces/interface';
import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import type { McpToolDefinition, ToolInput } from './types';

/** Pass this as workspaceId to target the main React UI window instead of a wiki webview. */
const MAIN_WINDOW_TARGET = 'main-window';

// ─── Tool Definitions ─────────────────────────────────────────────────────────

export const TOOLS: McpToolDefinition[] = [
  // ── UI interaction (like Chrome DevTools Protocol) ────────────────────────
  {
    name: 'ui_snapshot',
    description: 'Get a DOM/text snapshot: page title, URL, visible text, interactive elements with center coordinates, and links. workspaceId targets a wiki webview; use "main-window" for the main React UI (sidebar, settings, workspace switcher). Omit workspaceId to use the active workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'Workspace ID, or "main-window" for the main app UI. Omit to use active workspace.' },
      },
    },
  },
  {
    name: 'ui_screenshot',
    description: 'Take a screenshot. workspaceId targets a wiki webview; use "main-window" for the main React UI. Omit to use active workspace. Returns base64-encoded PNG.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'Workspace ID, or "main-window" for the main app UI. Omit to use active workspace.' },
      },
    },
  },
  {
    name: 'ui_click',
    description: 'Click at (x, y). workspaceId targets a wiki webview; use "main-window" for the main React UI. Omit to use active workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate (pixels from left)' },
        y: { type: 'number', description: 'Y coordinate (pixels from top)' },
        workspaceId: { type: 'string', description: 'Workspace ID, or "main-window" for the main app UI. Omit to use active workspace.' },
        button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Mouse button (default: left)' },
        clickCount: { type: 'number', description: 'Number of clicks: 1=single, 2=double. Default: 1.' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'ui_type',
    description: 'Type text into the currently focused element. workspaceId targets a wiki webview; use "main-window" for the main React UI.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to type' },
        workspaceId: { type: 'string', description: 'Workspace ID, or "main-window" for the main app UI. Omit to use active workspace.' },
      },
      required: ['text'],
    },
  },
  {
    name: 'ui_key',
    description: 'Press a keyboard key or shortcut, e.g. "Enter", "Escape", "Control+s". Use "main-window" to target the main React UI.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key name or combo, e.g. "Enter", "Tab", "Control+s"' },
        workspaceId: { type: 'string', description: 'Workspace ID, or "main-window" for the main app UI. Omit to use active workspace.' },
      },
      required: ['key'],
    },
  },
  {
    name: 'ui_navigate',
    description: 'Navigate the workspace webview to a URL, e.g. "tidgi://workspaceId/#TiddlerTitle". Only works for wiki webviews, not "main-window".',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to load' },
        workspaceId: { type: 'string', description: 'Workspace ID. Omit to use active workspace.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'ui_evaluate',
    description: 'Evaluate JavaScript and return the result. In wiki webviews, $tw.wiki API is available. Use "main-window" to query the main React UI (window.service, React state, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        script: { type: 'string', description: 'JavaScript to evaluate. The last expression value is returned.' },
        workspaceId: { type: 'string', description: 'Workspace ID, or "main-window" for the main app UI. Omit to use active workspace.' },
      },
      required: ['script'],
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
      }, ms),
    ),
  ]);
}

async function getWebContents(workspaceId: string | undefined) {
  // Special target: main React UI window (sidebar, settings, workspace switcher)
  if (workspaceId === MAIN_WINDOW_TARGET) {
    const windowService = container.get<IWindowService>(serviceIdentifier.Window);
    const win = windowService.get(WindowNames.main);
    if (!win) throw new Error('Main window not found.');
    const { webContents } = win;
    if (webContents.isDestroyed()) throw new Error('Main window webContents is destroyed.');
    return { webContents, wsId: MAIN_WINDOW_TARGET };
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
    case 'ui_snapshot': {
      const { workspaceId } = input as { workspaceId?: string };
      const { webContents } = await getWebContents(workspaceId);
      const text = await withTimeout(
        webContents.executeJavaScript(`
          JSON.stringify({
            title: document.title,
            url: location.href,
            body: document.body ? document.body.innerText.slice(0, 6000) : '',
            interactive: Array.from(document.querySelectorAll('input,textarea,button,select,[contenteditable],[role="button"],[role="textbox"]')).slice(0, 60).map(el => {
              const r = el.getBoundingClientRect();
              return {
                tag: el.tagName.toLowerCase(),
                type: el.type || el.getAttribute('type') || '',
                id: el.id || '',
                name: el.name || '',
                placeholder: el.placeholder || '',
                value: (el.value || '').slice(0, 100),
                text: (el.innerText || el.textContent || '').slice(0, 80).trim(),
                role: el.getAttribute('role') || '',
                cx: Math.round(r.x + r.width / 2),
                cy: Math.round(r.y + r.height / 2),
              };
            }),
            links: Array.from(document.querySelectorAll('a[href]')).slice(0, 30).map(a => {
              const r = a.getBoundingClientRect();
              return { text: (a.innerText||'').slice(0,60).trim(), href: a.href, cx: Math.round(r.x + r.width/2), cy: Math.round(r.y + r.height/2) };
            }),
          })
        `),
        10_000,
        'ui_snapshot',
      );
      return JSON.parse(text as string);
    }

    case 'ui_screenshot': {
      const { workspaceId } = input as { workspaceId?: string };
      const { webContents } = await getWebContents(workspaceId);
      const image = await withTimeout(webContents.capturePage(), 10_000, 'ui_screenshot');
      return { mimeType: 'image/png', base64: image.toPNG().toString('base64') };
    }

    case 'ui_click': {
      const { workspaceId, x, y, button = 'left', clickCount = 1 } = input as {
        workspaceId?: string; x: number; y: number; button?: 'left' | 'right' | 'middle'; clickCount?: number;
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
      for (const char of text) {
        webContents.sendInputEvent({ type: 'char', keyCode: char });
      }
      return { success: true, length: text.length };
    }

    case 'ui_key': {
      const { workspaceId, key } = input as { workspaceId?: string; key: string };
      const { webContents } = await getWebContents(workspaceId);
      const parts = key.split('+');
      const mainKey = parts.at(-1) ?? key;
      const modifiers = parts.slice(0, -1).map(m => m.toLowerCase());
      webContents.sendInputEvent({ type: 'keyDown', keyCode: mainKey, modifiers: modifiers as never });
      webContents.sendInputEvent({ type: 'keyUp', keyCode: mainKey, modifiers: modifiers as never });
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
        throw new Error(`ui_evaluate script error: ${raw.error ?? '(unknown)'}\n${raw.stack ?? ''}`);
      }
      return raw.value;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

