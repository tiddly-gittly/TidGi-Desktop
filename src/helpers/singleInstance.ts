import { logger } from '@services/libs/log';
import { app } from 'electron';

const gotTheLock = app.requestSingleInstanceLock();

logger.info('App booting');

if (!gotTheLock) {
  logger.info('Quitting dut to we only allow one instance to run.');
  console.info('Quitting dut to we only allow one instance to run.');
  app.quit();
}
