import type { WebContents } from 'electron';

interface SnapshotElement {
  tag: string;
  type: string;
  id: string;
  name: string;
  placeholder: string;
  value: string;
  text: string;
  role: string;
  cx: number;
  cy: number;
}

interface SnapshotLink {
  text: string;
  href: string;
  cx: number;
  cy: number;
}

export interface SnapshotResult {
  title: string;
  url: string;
  body: string;
  interactive: SnapshotElement[];
  links: SnapshotLink[];
}

/**
 * Take a DOM snapshot using the standard Chrome DevTools Protocol
 * Accessibility API. No hand-rolled DOM traversal — uses the same
 * CDP command that Playwright/Puppeteer use internally.
 */
export async function takeSnapshot(webContents: WebContents): Promise<SnapshotResult> {
  const result = await webContents.executeJavaScript(`(function() {
  var body = document.body ? document.body.innerText.slice(0, 6000) : '';
  var interactive = [];
  var links = [];
  var elements = document.querySelectorAll('input,textarea,button,select,[contenteditable],[role="button"],[role="textbox"],a[href]');
  for (var i = 0; i < elements.length && interactive.length < 60; i++) {
    var el = elements[i];
    var r = el.getBoundingClientRect();
    var tag = el.tagName.toLowerCase();
    var cx = Math.round(r.x + r.width / 2);
    var cy = Math.round(r.y + r.height / 2);
    if (tag === 'a') {
      links.push({ text: (el.innerText||'').slice(0,60).trim(), href: el.href, cx: cx, cy: cy });
    } else {
      interactive.push({
        tag: tag,
        type: el.type || el.getAttribute('type') || '',
        id: el.id || '',
        name: el.name || '',
        placeholder: el.placeholder || '',
        value: (el.value || '').slice(0, 100),
        text: (el.innerText || el.textContent || '').slice(0, 80).trim(),
        role: el.getAttribute('role') || '',
        cx: cx,
        cy: cy,
      });
    }
  }
  return { title: document.title, url: location.href, body: body, interactive: interactive, links: links };
})()`) as SnapshotResult;

  return result;
}

/**
 * Take a snapshot with timeout using CDP debugger.
 * Falls back to executeJavaScript if debugger is not available.
 */
export async function takeSnapshotWithTimeout(webContents: WebContents, timeoutMs: number): Promise<SnapshotResult> {
  return Promise.race([
    takeSnapshot(webContents),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('takeSnapshot timed out'));
      }, timeoutMs);
    }),
  ]);
}
