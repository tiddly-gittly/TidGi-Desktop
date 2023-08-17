import { logger } from '@services/libs/log';
import { app } from 'electron';

/**
 * Will return false if another instance with same `userData` path is already running. So we set different userData for dev and prod mode in `src/constants/appPaths.ts`, so you can open production tidgi during dev tidgi.
 */
const gotTheLock = app.requestSingleInstanceLock();

logger.info('App booting');

if (!gotTheLock) {
  logger.info('Quitting dut to we only allow one instance to run.');
  console.info('Quitting dut to we only allow one instance to run.');
  app.quit();
}
