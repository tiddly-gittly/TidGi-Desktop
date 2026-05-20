import type { WebContents } from 'electron';

interface AxNode {
  nodeId: string;
  role?: { value: string };
  name?: { value: string };
  description?: { value: string };
  value?: { value: string };
  properties?: Array<{ name: string; value: { value: string } }>;
  childIds?: string[];
  backendDOMNodeId?: number;
}

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
 * Take a DOM snapshot using Chrome DevTools Protocol Accessibility.getFullAXTree.
 * This is the same CDP command that Playwright and Chrome MCP use internally.
 */
export async function takeSnapshot(webContents: WebContents): Promise<SnapshotResult> {
  if (!webContents.debugger.isAttached()) {
    webContents.debugger.attach('1.3');
  }
  let detached = false;

  try {
    const [{ nodes: axNodes }, { result: titleResult }, { result: urlResult }] = await Promise.all([
      webContents.debugger.sendCommand('Accessibility.getFullAXTree', {}) as Promise<{ nodes: AxNode[] }>,
      webContents.debugger.sendCommand('Runtime.evaluate', { expression: 'document.title' }),
      webContents.debugger.sendCommand('Runtime.evaluate', { expression: 'location.href' }),
    ]);

    const interactive: SnapshotElement[] = [];
    const links: SnapshotLink[] = [];
    const bodyParts: string[] = [];

    function walk(node: AxNode): void {
      if (node.role?.value === 'StaticText') {
        const text = node.name?.value || '';
        if (text) bodyParts.push(text);
        return;
      }

      const role = node.role?.value || '';
      const name = node.name?.value || '';
      const isInteractive = [
        'button',
        'link',
        'textbox',
        'combobox',
        'listbox',
        'menuitem',
        'menuitemcheckbox',
        'menuitemradio',
        'option',
        'radio',
        'slider',
        'spinbutton',
        'switch',
        'tab',
        'treeitem',
        'checkbox',
      ].includes(role);

      if (isInteractive && interactive.length < 60) {
        const props = Object.fromEntries((node.properties ?? []).map((p) => [p.name, p.value.value]));
        const entry: SnapshotElement = {
          tag: role === 'textbox' ? 'input' : role === 'combobox' ? 'select' : role === 'link' ? 'a' : role,
          type: props['valuetype'] || '',
          id: props['id'] || '',
          name: props['name'] || '',
          placeholder: props['placeholder'] || '',
          value: node.value?.value || '',
          text: name || node.description?.value || '',
          role,
          cx: 0,
          cy: 0,
        };
        if (role === 'link') {
          links.push({ text: name, href: props.href || '', cx: 0, cy: 0 });
        } else {
          interactive.push(entry);
        }
      }

      if (node.childIds) {
        for (const childId of node.childIds) {
          const child = axNodes.find((n) => n.nodeId === childId);
          if (child) walk(child);
        }
      }
    }

    for (const node of axNodes) {
      walk(node);
    }

    webContents.debugger.detach();
    detached = true;

    return {
      title: titleResult?.value ?? '',
      url: urlResult?.value ?? '',
      body: bodyParts.join(' ').slice(0, 6000),
      interactive,
      links: links.slice(0, 30),
    };
  } finally {
    if (!detached && webContents.debugger.isAttached()) {
      webContents.debugger.detach();
    }
  }
}
