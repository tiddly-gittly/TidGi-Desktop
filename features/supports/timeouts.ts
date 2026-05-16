import { setDefaultTimeout } from '@cucumber/cucumber';
import { getMeasuredElementTimeoutMs, getMeasuredLaunchTimeoutMs, getMeasuredStepTimeoutMs } from './calibration';

const isCI = process.env.CI;

export const CUCUMBER_GLOBAL_TIMEOUT = getMeasuredStepTimeoutMs();
console.log(`[Timeout] step=${CUCUMBER_GLOBAL_TIMEOUT}ms (CI=${isCI})`);
setDefaultTimeout(CUCUMBER_GLOBAL_TIMEOUT);

export const PLAYWRIGHT_SHORT_TIMEOUT = getMeasuredElementTimeoutMs();
// Content-waiting budget: launch + element = worst-case async rendering time.
// Computed eagerly via calibration functions (safe — calibrated during preflight).
// Kept separate from click timeout so autocomplete panels and complex UI have headroom.
export const PLAYWRIGHT_TIMEOUT = getMeasuredLaunchTimeoutMs() + getMeasuredElementTimeoutMs();
export const HEAVY_PLAYWRIGHT_TIMEOUT = getMeasuredLaunchTimeoutMs();
export const LOG_MARKER_WAIT_TIMEOUT = CUCUMBER_GLOBAL_TIMEOUT;
export const HEAVY_LOG_MARKER_WAIT_TIMEOUT = CUCUMBER_GLOBAL_TIMEOUT;
export const HEAVY_OPERATION_TIMEOUT = CUCUMBER_GLOBAL_TIMEOUT;

export const UI_RETRY_ATTEMPTS = Math.max(1, Math.round(CUCUMBER_GLOBAL_TIMEOUT / PLAYWRIGHT_TIMEOUT));
