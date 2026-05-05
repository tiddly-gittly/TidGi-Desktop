import { setDefaultTimeout } from '@cucumber/cucumber';
import { getMeasuredLaunchTimeoutMs, getMeasuredStepTimeoutMs, getMeasuredWaitTimeoutMs } from './calibration';

const isCI = process.env.CI;

/**
 * Cucumber global timeout per step — measured from worst-case step in calibration.
 */
export const CUCUMBER_GLOBAL_TIMEOUT = getMeasuredStepTimeoutMs();

console.log(
  `[Timeout Config] step=${CUCUMBER_GLOBAL_TIMEOUT}ms (CI=${isCI})`,
);

setDefaultTimeout(CUCUMBER_GLOBAL_TIMEOUT);

/**
 * Element-finding operations (clicks, selectors, typing).
 * Fixed short timeout — if an element isn't there, fail fast.
 */
export const PLAYWRIGHT_TIMEOUT = 10000;

export const PLAYWRIGHT_SHORT_TIMEOUT = 5000;

/**
 * App launch + page load — measured from launch/browser-view steps in calibration.
 */
export const HEAVY_PLAYWRIGHT_TIMEOUT = getMeasuredLaunchTimeoutMs();

/**
 * Log marker / SSE / watch-fs waits — measured from wait/log steps in calibration.
 */
export const LOG_MARKER_WAIT_TIMEOUT = getMeasuredWaitTimeoutMs();

export const HEAVY_OPERATION_TIMEOUT = CUCUMBER_GLOBAL_TIMEOUT;
export const HEAVY_LOG_MARKER_WAIT_TIMEOUT = LOG_MARKER_WAIT_TIMEOUT;

/**
 * UI retry attempts — more retries needed when element timeouts (10s) are
 * short relative to the calibrated step budget.
 */
export const UI_RETRY_ATTEMPTS = Math.max(3, Math.round(CUCUMBER_GLOBAL_TIMEOUT / 3000));
