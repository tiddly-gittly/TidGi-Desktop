import { setDefaultTimeout } from '@cucumber/cucumber';
import { getCpuPerformanceMultiplier } from './cpuBenchmark';

const isCI = Boolean(process.env.CI);

const performanceMultiplier = isCI ? 1.0 : getCpuPerformanceMultiplier();

const BASE_TIMEOUT = 25000;

/**
 * Cucumber global timeout budget per step/hook, scaled by CPU performance.
 * Fast machines get tight timeouts (fast bug detection), slow machines get room they need.
 */
export const CUCUMBER_GLOBAL_TIMEOUT = Math.round(BASE_TIMEOUT * performanceMultiplier);

console.log(
  `[Timeout Config] multiplier=${performanceMultiplier.toFixed(2)}×  step budget=${CUCUMBER_GLOBAL_TIMEOUT} ms  (CI=${isCI})`,
);

setDefaultTimeout(CUCUMBER_GLOBAL_TIMEOUT);

/**
 * Timeout for Playwright waitForSelector and similar operations.
 * Internal timeouts for finding elements, not Cucumber step timeouts.
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

/**
 * Number of retry attempts for UI operations, scaled by performance.
 */
export const UI_RETRY_ATTEMPTS = Math.max(3, Math.round(10 * performanceMultiplier));
