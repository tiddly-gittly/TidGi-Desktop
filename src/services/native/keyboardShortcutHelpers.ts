import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { globalShortcut } from 'electron';

/**
 * Get the callback function for a shortcut key
 * @param key The key in format "ServiceIdentifier.methodName"
 * @returns The callback function or undefined
 */
export function getShortcutCallback(key: string): (() => void) | undefined {
  // Split the key into service and method parts
  const [serviceIdentifierName, methodName] = key.split('.');
  // If we don't have any part, return
  if (!serviceIdentifierName || !methodName) {
    return;
  }
  // Get the service identifier symbol
  const serviceSymbol = (serviceIdentifier as Record<string, symbol>)[serviceIdentifierName];
  if (serviceSymbol === undefined) {
    return;
  }
  // Return a callback that gets the service from container and calls the method
  return async () => {
    try {
      // Get the service instance from container lazily
      const service = container.get<Record<string, (...arguments_: unknown[]) => unknown>>(serviceSymbol);
      logger.debug('Shortcut triggered', { key, service: serviceIdentifierName, method: methodName, function: 'getShortcutCallback' });
      if (service && typeof service[methodName] === 'function') {
        // Call the method with await if it's an async method
        await service[methodName]();
      } else {
        logger.warn('Shortcut target method not found', { key, service: serviceIdentifierName, method: methodName, function: 'getShortcutCallback' });
      }
    } catch (error) {
      logger.error(`Failed to execute shortcut callback for ${key}`, { error, function: 'getShortcutCallback' });
    }
  };
}

/**
 * Register a shortcut by key
 * @param key The key in format "ServiceIdentifier.methodName"
 * @param shortcut The shortcut string (e.g. "CmdOrCtrl+Shift+T")
 */
export async function registerShortcutByKey(key: string, shortcut: string): Promise<void> {
  // Unregister any existing shortcut first
  if (globalShortcut.isRegistered(shortcut)) {
    globalShortcut.unregister(shortcut);
  }

  // Get the callback for this key
  const callback = getShortcutCallback(key);
  if (!callback) {
    logger.warn('No callback found for shortcut key', { key });
    return;
  }

  // Register the new shortcut
  const success = globalShortcut.register(shortcut, callback);

  if (success) {
    logger.info('Successfully registered shortcut', { key, shortcut, function: 'registerShortcutByKey' });
  } else {
    logger.error('Failed to register shortcut', { key, shortcut, function: 'registerShortcutByKey' });
    throw new Error(`Failed to register shortcut: ${shortcut}`);
  }
}
