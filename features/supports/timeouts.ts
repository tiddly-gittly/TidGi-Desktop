import { setDefaultTimeout } from '@cucumber/cucumber';
import { getMeasuredStepTimeoutMs } from './calibration';

const isCI = process.env.CI;

/**
 * Cucumber global timeout per step/hook.
 * Measured from calibration smoke test — the worst-case individual step duration.
 * Light operations (clicks, element checks) fail fast via PLAYWRIGHT_TIMEOUT (10s).
 */
export const CUCUMBER_GLOBAL_TIMEOUT = getMeasuredStepTimeoutMs();

console.log(
  `[Timeout Config] step budget=${CUCUMBER_GLOBAL_TIMEOUT} ms  (CI=${isCI})`,
);

setDefaultTimeout(CUCUMBER_GLOBAL_TIMEOUT);

/**
 * Fixed short timeout for element-finding (clicks, selectors, typing).
 * If an element isn't there within 10s, it's a real bug — fail fast.
 */
export const PLAYWRIGHT_TIMEOUT = 10000;

export const PLAYWRIGHT_SHORT_TIMEOUT = 5000;

/**
 * Heavy Playwright timeout for app launch and page load.
 * Uses the calibrated worst-case measurement.
 */
export const HEAVY_PLAYWRIGHT_TIMEOUT = CUCUMBER_GLOBAL_TIMEOUT;

/**
 * Log marker wait — nearly full step budget minus buffer for error reporting.
 * With short step timeouts (measured from calibration), every ms counts.
 */
export const LOG_MARKER_WAIT_TIMEOUT = Math.max(CUCUMBER_GLOBAL_TIMEOUT - 500, 4000);

export const HEAVY_OPERATION_TIMEOUT = CUCUMBER_GLOBAL_TIMEOUT;
export const HEAVY_LOG_MARKER_WAIT_TIMEOUT = LOG_MARKER_WAIT_TIMEOUT;

/**
 * UI retry attempts. More retries on slower machines since individual element
 * timeouts are fixed at 10s regardless of calibration.
 */
export const UI_RETRY_ATTEMPTS = Math.max(3, Math.round(CUCUMBER_GLOBAL_TIMEOUT / 3000));
