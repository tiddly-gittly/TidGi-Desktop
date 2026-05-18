import { setDefaultTimeout } from '@cucumber/cucumber';
import { getMeasuredElementTimeoutMs, getMeasuredLaunchTimeoutMs, getMeasuredStepTimeoutMs } from './calibration';

const isCI = process.env.CI;

// Calibration measures 3 smoke scenarios → real test suite has 66 scenarios
// with window launches, git sync, file watch, SSE. Multipliers expand the
// measured worst-case to cover heavier real-world operations. Values are
// entirely calibration-derived — no arbitrary hardcoded numbers.
const STEP_COVERAGE_FACTOR = 3;
const LAUNCH_COVERAGE_FACTOR = 4;
const ELEMENT_COVERAGE_FACTOR = 3;

export const CUCUMBER_GLOBAL_TIMEOUT = getMeasuredStepTimeoutMs() * STEP_COVERAGE_FACTOR;
console.log(`[Timeout] step=${CUCUMBER_GLOBAL_TIMEOUT}ms (CI=${isCI})`);
setDefaultTimeout(CUCUMBER_GLOBAL_TIMEOUT);

export const PLAYWRIGHT_SHORT_TIMEOUT = getMeasuredElementTimeoutMs() * ELEMENT_COVERAGE_FACTOR;
export const HEAVY_PLAYWRIGHT_TIMEOUT = getMeasuredLaunchTimeoutMs() * LAUNCH_COVERAGE_FACTOR;
// Content-waiting budget: measured launch+element with coverage factor.
// Separate from step timeout so missing selectors fail fast for debugging.
const CONTENT_COVERAGE_FACTOR = 2;
export const PLAYWRIGHT_TIMEOUT = (getMeasuredLaunchTimeoutMs() + getMeasuredElementTimeoutMs()) * CONTENT_COVERAGE_FACTOR;
export const LOG_MARKER_WAIT_TIMEOUT = CUCUMBER_GLOBAL_TIMEOUT;
export const HEAVY_LOG_MARKER_WAIT_TIMEOUT = CUCUMBER_GLOBAL_TIMEOUT;
export const HEAVY_OPERATION_TIMEOUT = CUCUMBER_GLOBAL_TIMEOUT;

export const UI_RETRY_ATTEMPTS = Math.max(1, Math.round(CUCUMBER_GLOBAL_TIMEOUT / PLAYWRIGHT_TIMEOUT));
