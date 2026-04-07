import { WindowNames } from '@services/windows/WindowProperties';

/**
 * Resolve a context key (like 'LOG_FOLDER') to its runtime value.
 */
export async function resolveContextArgument(key: string): Promise<string | undefined> {
  const value = await window.service.context.get(key as Parameters<typeof window.service.context.get>[0]);
  return typeof value === 'string' ? value : undefined;
}

// ─── Generic dynamic dispatcher ──────────────────────────────────────

type ServiceMap = typeof window.service;

/**
 * Try to call `window.service[serviceName][methodName](...args)` dynamically.
 * Returns true if the service+method combo exists and was called.
 */
async function tryDispatch(handlerId: string, arguments_: string[]): Promise<boolean> {
  const dotIndex = handlerId.indexOf('.');
  if (dotIndex <= 0) return false;
  const serviceName = handlerId.slice(0, dotIndex) as keyof ServiceMap;
  const methodName = handlerId.slice(dotIndex + 1);
  const svc = window.service[serviceName];
  if (svc === undefined || svc === null) return false;
  const method = (svc as Record<string, unknown>)[methodName];
  if (typeof method !== 'function') return false;
  await (method as (...a: unknown[]) => Promise<void>)(...arguments_);
  return true;
}

// ─── Explicit handlers (only for non-trivial forwarding) ─────────────

const explicitHandlers: Record<string, (...arguments_: string[]) => Promise<void>> = {
  'native.openPath': async (...arguments_: string[]) => {
    const path = await resolveContextArgument(arguments_[0]);
    if (path) {
      await window.service.native.openPath(path, true);
    }
  },
  'window.open': async (...arguments_: string[]) => {
    await window.service.window.open(arguments_[0] as WindowNames);
  },
  'notification.test': async () => {
    await window.service.notification.show({
      title: 'Test Notification',
      body: 'It is working!',
    });
  },
  'native.pickDirectory': async () => {
    const currentPath = (await window.service.preference.get('downloadPath')) ?? '';
    const filePaths = await window.service.native.pickDirectory(currentPath);
    if (filePaths.length > 0) {
      await window.service.preference.set('downloadPath', filePaths[0]);
    }
  },
  'memeloopNode.showIdentity': async () => {
    const identity = await window.service.memeloopNode.getIdentityStatus();
    let pinCode = '';
    try {
      const storedPin = await window.service.memeloopNode.getLocalPinCode();
      if (storedPin) pinCode = storedPin;
    } catch {
      // Ignored
    }
    const msg = `Node ID: ${identity.nodeId}\nHas Keypair: ${identity.hasKeypair ? 'Yes' : 'No'}\nKnown Nodes: ${identity.knownNodeCount}\nPIN Code: ${pinCode || 'None'}`;
    await window.service.native.showElectronMessageBox({ title: 'Node Identity', message: msg });
  },
  'memeloopNode.showKnownNodes': async () => {
    const nodes = await window.service.memeloopNode.getKnownNodes();
    const msg = nodes.length > 0 ? nodes.map(n => `${n.name || n.nodeId.slice(0, 16)} (${n.trustSource})`).join('\n') : 'No known nodes';
    await window.service.native.showElectronMessageBox({ title: 'Known Nodes', message: msg });
  },
  'memeloopNode.showRemoteWikis': async () => {
    const wikis = await window.service.memeloopNode.listAllRemoteWikis();
    const msg = wikis.length > 0 ? wikis.map(w => w.name).join('\n') : 'No remote wikis';
    await window.service.native.showElectronMessageBox({ title: 'Remote Wikis', message: msg });
  },
  'memeloopNode.showSyncStatus': async () => {
    const status = await window.service.memeloopNode.getSyncStatus();
    const msg = `Connected peers: ${status.peerCount}\nSync currently active: ${status.syncRunning ? 'Yes' : 'No'}`;
    await window.service.native.showElectronMessageBox({ title: 'Sync Status', message: msg });
  },
};

/**
 * Get an action handler by its ID.
 * First checks explicit handlers, then falls back to dynamic dispatch
 * via `window.service[serviceName][methodName]`.
 */
export function getActionHandler(handlerId: string): (...arguments_: string[]) => Promise<void> {
  const explicit = explicitHandlers[handlerId];
  if (explicit) return explicit;
  return async (...arguments_: string[]) => {
    const dispatched = await tryDispatch(handlerId, arguments_);
    if (!dispatched) {
      console.warn(`No action handler found for "${handlerId}"`);
    }
  };
}
