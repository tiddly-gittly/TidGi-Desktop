import { setDefaultTimeout } from '@cucumber/cucumber';
import { getPerformanceMultiplier, isCalibrated } from './calibration';

const isCI = Boolean(process.env.CI);

/**
 * Get the performance multiplier.
 * CI always uses 1.0×, local dev uses calibrated multiplier.
 */
function getMultiplier(): number {
  if (isCI) return 1.0;

  const multiplier = getPerformanceMultiplier();

  // Log warning if calibration hasn't run yet
  if (!isCalibrated()) {
    console.warn('[Timeout Config] Using fallback multiplier - calibration not yet performed');
  }

  return multiplier;
}

const performanceMultiplier = getMultiplier();
const BASE_TIMEOUT = 25000;
const HEAVY_OPERATION_MULTIPLIER = 1.6;

/**
 * Cucumber global timeout budget per step/hook, scaled by E2E performance.
 * Fast machines get tight timeouts (fast bug detection), slow machines get room they need.
 */
export const CUCUMBER_GLOBAL_TIMEOUT = Math.round(BASE_TIMEOUT * performanceMultiplier);
export const HEAVY_OPERATION_TIMEOUT = Math.round(CUCUMBER_GLOBAL_TIMEOUT * HEAVY_OPERATION_MULTIPLIER);

console.log(
  `[Timeout Config] multiplier=${performanceMultiplier.toFixed(2)}×  step budget=${CUCUMBER_GLOBAL_TIMEOUT} ms  (CI=${isCI})`,
);
console.log(
  `[Timeout Config] heavy budget=${HEAVY_OPERATION_TIMEOUT} ms`,
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
export const HEAVY_LOG_MARKER_WAIT_TIMEOUT = Math.max(10000, HEAVY_OPERATION_TIMEOUT - 5000);

/**
 * Number of retry attempts for UI operations, scaled by performance.
 */
export const UI_RETRY_ATTEMPTS = Math.max(3, Math.round(10 * performanceMultiplier));
