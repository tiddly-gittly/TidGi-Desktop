import { USER_DATA_FOLDER } from '@/constants/appPaths';
import { isTest } from '@/constants/environment';
import { logger } from '@services/libs/log';
import { app } from 'electron';

/**
 * Request single instance lock in non-test environments.
 *
 * Note: requestSingleInstanceLock() is NOT based on userData path - it's a global lock
 * based on the app name/executable. The comment below is kept for historical context but is incorrect.
 *
 * In test mode, we skip the lock because:
 * 1. Each test scenario has its own isolated userData directory (--test-scenario=xxx)
 * 2. Tests may need to run in parallel or sequentially without blocking each other
 * 3. The lock would prevent valid test scenarios from running
 *
 * [Historical incorrect comment: Will return false if another instance with same `userData` path is already running.]
 */
const gotTheLock = isTest ? true : app.requestSingleInstanceLock();

logger.info('App booting');

if (!gotTheLock) {
  logger.info(`Quitting dut to we only allow one instance to run. USER_DATA_FOLDER = ${USER_DATA_FOLDER}`);
  console.info(`Quitting dut to we only allow one instance to run. USER_DATA_FOLDER = ${USER_DATA_FOLDER}`);
  app.quit();
}
