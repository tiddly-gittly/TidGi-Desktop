import { setDefaultTimeout } from '@cucumber/cucumber';
import { BASE_STEP_TIMEOUT_MS, getPerformanceMultiplier } from './calibration';

const isCI = process.env.CI;

const performanceMultiplier = getPerformanceMultiplier();

/**
 * Cucumber global timeout budget per step/hook.
 * Covers the worst-case heavy operations (app launch, filesystem watch init).
 * Light operations (clicks, element checks) should fail faster via
 * PLAYWRIGHT_TIMEOUT which is intentionally short to surface real bugs quickly.
 *
 *   step_timeout = BASE_STEP_TIMEOUT_MS × multiplier
 */
export const CUCUMBER_GLOBAL_TIMEOUT = Math.round(BASE_STEP_TIMEOUT_MS * performanceMultiplier);

console.log(
  `[Timeout Config] multiplier=${performanceMultiplier.toFixed(2)}×  step budget=${CUCUMBER_GLOBAL_TIMEOUT} ms  (CI=${isCI})`,
);

setDefaultTimeout(CUCUMBER_GLOBAL_TIMEOUT);

/**
 * Short timeout for element-finding operations (clicks, selectors, typing).
 * If an element isn't visible within 10s, there's a real bug - don't wait longer.
 * Fixed value, intentionally NOT scaled by calibration.
 */
export const PLAYWRIGHT_TIMEOUT = 10000; // 10s - fail fast for missing elements

/**
 * Shorter timeout for operations that must complete very quickly.
 */
export const PLAYWRIGHT_SHORT_TIMEOUT = 5000; // 5s

/**
 * Heavy Playwright timeout for app launch and page load operations.
 * Scaled by calibration since these are genuinely slow on weak hardware.
 */
export const HEAVY_PLAYWRIGHT_TIMEOUT = CUCUMBER_GLOBAL_TIMEOUT;

/**
 * Timeout for waiting log markers.
 * Internal wait should be shorter than step timeout to allow proper error reporting.
 */
export const LOG_MARKER_WAIT_TIMEOUT = Math.max(5000, CUCUMBER_GLOBAL_TIMEOUT - 5000);

// Backward-compatible aliases
export const HEAVY_OPERATION_TIMEOUT = CUCUMBER_GLOBAL_TIMEOUT;
export const HEAVY_LOG_MARKER_WAIT_TIMEOUT = LOG_MARKER_WAIT_TIMEOUT;

/**
 * Number of retry attempts for UI operations, scaled by performance.
 * Since PLAYWRIGHT_TIMEOUT is fixed, retries compensate for slow environments.
 */
export const UI_RETRY_ATTEMPTS = Math.max(3, Math.round(10 * performanceMultiplier));
