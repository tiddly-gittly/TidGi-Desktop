import { setDefaultTimeout } from '@cucumber/cucumber';
import { getMeasuredElementTimeoutMs, getMeasuredLaunchTimeoutMs, getMeasuredStepTimeoutMs, getMeasuredWaitTimeoutMs } from './calibration';

const isCI = process.env.CI;

// Cucumber global step timeout — generous ceiling to catch genuinely stuck steps.
// Per-type timeouts (PLAYWRIGHT_TIMEOUT, etc.) are tight and measured.
// This value is lenient because the smoke-test calibration can't predict
// the worst step from complex scenarios (AI, sync, hibernation).
export const CUCUMBER_GLOBAL_TIMEOUT = getMeasuredStepTimeoutMs();
console.log(`[Timeout] step=${CUCUMBER_GLOBAL_TIMEOUT}ms (CI=${isCI})`);
setDefaultTimeout(CUCUMBER_GLOBAL_TIMEOUT);

// Per-type timeouts — measured from calibration for fast failure on real issues.
export const PLAYWRIGHT_TIMEOUT = getMeasuredElementTimeoutMs();
export const PLAYWRIGHT_SHORT_TIMEOUT = getMeasuredElementTimeoutMs();
export const HEAVY_PLAYWRIGHT_TIMEOUT = getMeasuredLaunchTimeoutMs();
// Log-marker waits can involve background processes (sync, git, SSE)
// that take longer than measured element waits. Use the generous step budget.
export const LOG_MARKER_WAIT_TIMEOUT = CUCUMBER_GLOBAL_TIMEOUT;
export const HEAVY_LOG_MARKER_WAIT_TIMEOUT = CUCUMBER_GLOBAL_TIMEOUT;
export const HEAVY_OPERATION_TIMEOUT = CUCUMBER_GLOBAL_TIMEOUT;

// Retry budget: how many element-level retries fit within the step timeout.
export const UI_RETRY_ATTEMPTS = Math.max(1, Math.round(CUCUMBER_GLOBAL_TIMEOUT / PLAYWRIGHT_TIMEOUT));
