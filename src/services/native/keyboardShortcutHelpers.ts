import { isTest } from '@/constants/environment';
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { globalShortcut } from 'electron';

/**
 * Get the callback function for a shortcut key
 * @param key The key in format "ServiceIdentifier.methodName"
 * @returns The callback function or undefined
 */
export function getShortcutCallback(key: string): (() => Promise<void>) | undefined {
  logger.debug('Getting shortcut callback', { key, function: 'getShortcutCallback' });

  // Split the key into service and method parts
  const [serviceIdentifierName, methodName] = key.split('.');
  logger.debug('Parsed key components', { serviceIdentifierName, methodName, function: 'getShortcutCallback' });

  // If we don't have any part, return
  if (!serviceIdentifierName || !methodName) {
    logger.warn('Invalid key format', { key, serviceIdentifierName, methodName, function: 'getShortcutCallback' });
    return;
  }

  // Get the service identifier symbol
  const serviceSymbol = (serviceIdentifier as Record<string, symbol>)[serviceIdentifierName];
  logger.debug('Service symbol lookup', {
    serviceIdentifierName,
    serviceSymbol: serviceSymbol?.toString(),
    availableServices: Object.keys(serviceIdentifier),
    function: 'getShortcutCallback',
  });

  if (serviceSymbol === undefined) {
    logger.warn('Service identifier not found', { serviceIdentifierName, availableServices: Object.keys(serviceIdentifier), function: 'getShortcutCallback' });
    return;
  }
  // Return a callback that gets the service from container and calls the method
  logger.debug('Creating callback function', { key, serviceIdentifierName, methodName, function: 'getShortcutCallback' });

  return async () => {
    try {
      logger.info('🔥 SHORTCUT TRIGGERED! 🔥', { key, service: serviceIdentifierName, method: methodName, function: 'getShortcutCallback' });
      logger.info('Shortcut triggered - starting execution', { key, service: serviceIdentifierName, method: methodName, function: 'getShortcutCallback' });

      // Get the service instance from container lazily
      const service = container.get<Record<string, (...arguments_: unknown[]) => unknown>>(serviceSymbol);
      logger.debug('Service instance retrieved', {
        key,
        service: serviceIdentifierName,
        method: methodName,
        serviceExists: !!service,
        serviceType: typeof service,
        availableMethods: service ? Object.keys(service).filter(k => typeof service[k] === 'function') : [],
        function: 'getShortcutCallback',
      });

      if (service && typeof service[methodName] === 'function') {
        logger.info('Calling service method', { key, service: serviceIdentifierName, method: methodName, function: 'getShortcutCallback' });
        // Call the method with await if it's an async method
        await service[methodName]();
        logger.info('Service method completed', { key, service: serviceIdentifierName, method: methodName, function: 'getShortcutCallback' });
      } else {
        logger.warn('Shortcut target method not found', {
          key,
          service: serviceIdentifierName,
          method: methodName,
          serviceExists: !!service,
          methodExists: service ? typeof service[methodName] : 'service is null',
          availableMethods: service ? Object.keys(service).filter(k => typeof service[k] === 'function') : [],
          function: 'getShortcutCallback',
        });
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
  // Skip in test, we use `src/helpers/testKeyboardShortcuts.ts` for test environment
  if (isTest) {
    logger.info('Skipping shortcut registration in test environment', { key, shortcut, function: 'registerShortcutByKey' });
    return;
  }
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
