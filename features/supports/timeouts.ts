import { setDefaultTimeout } from '@cucumber/cucumber';
import { getMeasuredElementTimeoutMs, getMeasuredLaunchTimeoutMs, getMeasuredStepTimeoutMs, getMeasuredWaitTimeoutMs } from './calibration';

const isCI = process.env.CI;

export const CUCUMBER_GLOBAL_TIMEOUT = getMeasuredStepTimeoutMs();
console.log(`[Timeout] step=${CUCUMBER_GLOBAL_TIMEOUT}ms (CI=${isCI})`);
setDefaultTimeout(CUCUMBER_GLOBAL_TIMEOUT);

// Per-category timeouts from calibration
export const LAUNCH_TIMEOUT = getMeasuredLaunchTimeoutMs();
export const WAIT_TIMEOUT = getMeasuredWaitTimeoutMs();
export const ELEMENT_TIMEOUT = getMeasuredElementTimeoutMs();

// Composite for steps that combine launch + element interaction
export const LAUNCH_ELEMENT_TIMEOUT = LAUNCH_TIMEOUT + ELEMENT_TIMEOUT;

// Legacy aliases — keep for existing step definitions that reference these names.
// New code should use the per-category timeouts above.
export const HEAVY_PLAYWRIGHT_TIMEOUT = LAUNCH_TIMEOUT;
export const PLAYWRIGHT_SHORT_TIMEOUT = ELEMENT_TIMEOUT;
export const PLAYWRIGHT_TIMEOUT = LAUNCH_ELEMENT_TIMEOUT;
export const LOG_MARKER_WAIT_TIMEOUT = WAIT_TIMEOUT;
export const HEAVY_LOG_MARKER_WAIT_TIMEOUT = WAIT_TIMEOUT;
export const HEAVY_OPERATION_TIMEOUT = CUCUMBER_GLOBAL_TIMEOUT;

export const UI_RETRY_ATTEMPTS = Math.max(1, Math.round(CUCUMBER_GLOBAL_TIMEOUT / LAUNCH_ELEMENT_TIMEOUT));
