import { setDefaultTimeout } from '@cucumber/cucumber';
import { getMeasuredElementTimeoutMs, getMeasuredLaunchTimeoutMs, getMeasuredStepTimeoutMs } from './calibration';

const isCI = process.env.CI;

export const CUCUMBER_GLOBAL_TIMEOUT = getMeasuredStepTimeoutMs();
console.log(`[Timeout] step=${CUCUMBER_GLOBAL_TIMEOUT}ms (CI=${isCI})`);
setDefaultTimeout(CUCUMBER_GLOBAL_TIMEOUT);

export const PLAYWRIGHT_TIMEOUT = getMeasuredElementTimeoutMs();
export const PLAYWRIGHT_SHORT_TIMEOUT = getMeasuredElementTimeoutMs();
export const HEAVY_PLAYWRIGHT_TIMEOUT = getMeasuredLaunchTimeoutMs();
// Log-marker waits need headroom so the enclosing cucumber step doesn't
// timeout before the wait completes. Reserve time for non-wait operations.
export const LOG_MARKER_WAIT_TIMEOUT = CUCUMBER_GLOBAL_TIMEOUT - PLAYWRIGHT_TIMEOUT - HEAVY_PLAYWRIGHT_TIMEOUT;
export const HEAVY_LOG_MARKER_WAIT_TIMEOUT = LOG_MARKER_WAIT_TIMEOUT;
export const HEAVY_OPERATION_TIMEOUT = CUCUMBER_GLOBAL_TIMEOUT;

export const UI_RETRY_ATTEMPTS = Math.max(1, Math.round(CUCUMBER_GLOBAL_TIMEOUT / PLAYWRIGHT_TIMEOUT));
