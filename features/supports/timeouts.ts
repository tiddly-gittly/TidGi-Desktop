import { setDefaultTimeout } from '@cucumber/cucumber';
import { BASE_STEP_TIMEOUT_MS, getPerformanceMultiplier } from './calibration';

const isCI = process.env.CI;

const performanceMultiplier = getPerformanceMultiplier();

/**
 * Cucumber global timeout budget per step/hook.
 * Calculated from calibration measurements:
 *   step_timeout = BASE_STEP_TIMEOUT_MS × multiplier
 *
 * BASE_STEP_TIMEOUT_MS (60s) = minimum budget on baseline reference CI.
 * multiplier scales this up for slower machines or down for faster ones.
 */
export const CUCUMBER_GLOBAL_TIMEOUT = Math.round(BASE_STEP_TIMEOUT_MS * performanceMultiplier);

console.log(
  `[Timeout Config] multiplier=${performanceMultiplier.toFixed(2)}×  step budget=${CUCUMBER_GLOBAL_TIMEOUT} ms  (CI=${isCI})`,
);

setDefaultTimeout(CUCUMBER_GLOBAL_TIMEOUT);

/**
 * Timeout for Playwright waitForSelector and similar operations.
 */
export const PLAYWRIGHT_TIMEOUT = CUCUMBER_GLOBAL_TIMEOUT;

/**
 * Shorter timeout for operations that should be very fast.
 */
export const PLAYWRIGHT_SHORT_TIMEOUT = Math.max(5000, CUCUMBER_GLOBAL_TIMEOUT - 5000);

/**
 * Timeout for waiting log markers.
 * Internal wait should be shorter than step timeout to allow proper error reporting.
 */
export const LOG_MARKER_WAIT_TIMEOUT = Math.max(5000, CUCUMBER_GLOBAL_TIMEOUT - 5000);

// Backward-compatible aliases (all derived from calibration, no separate heavy multiplier needed)
export const HEAVY_OPERATION_TIMEOUT = CUCUMBER_GLOBAL_TIMEOUT;
export const HEAVY_LOG_MARKER_WAIT_TIMEOUT = LOG_MARKER_WAIT_TIMEOUT;

/**
 * Number of retry attempts for UI operations, scaled by performance.
 */
export const UI_RETRY_ATTEMPTS = Math.max(3, Math.round(10 * performanceMultiplier));
