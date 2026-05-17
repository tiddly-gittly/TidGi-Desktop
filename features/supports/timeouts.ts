import { setDefaultTimeout } from '@cucumber/cucumber';
import { getMeasuredElementTimeoutMs, getMeasuredLaunchTimeoutMs, getMeasuredStepTimeoutMs } from './calibration';

const isCI = process.env.CI;

// Floors: calibration only measures 3 simple smoke scenarios. Real test suite
// has 66 scenarios, many much slower. Floors prevent timeout-on-normal-operation.
const FLOOR_STEP_MS = 120_000;
const FLOOR_LAUNCH_MS = 15_000;
const FLOOR_ELEMENT_MS = 5_000;

export const CUCUMBER_GLOBAL_TIMEOUT = Math.max(getMeasuredStepTimeoutMs(), FLOOR_STEP_MS);
console.log(`[Timeout] step=${CUCUMBER_GLOBAL_TIMEOUT}ms (CI=${isCI})`);
setDefaultTimeout(CUCUMBER_GLOBAL_TIMEOUT);

export const PLAYWRIGHT_SHORT_TIMEOUT = Math.max(getMeasuredElementTimeoutMs(), FLOOR_ELEMENT_MS);
// Content-waiting budget: launch + element = worst-case async rendering time.
// Computed eagerly via calibration functions (safe — calibrated during preflight).
// Kept separate from click timeout so autocomplete panels and complex UI have headroom.
export const PLAYWRIGHT_TIMEOUT = Math.max(
  getMeasuredLaunchTimeoutMs() + getMeasuredElementTimeoutMs(),
  FLOOR_LAUNCH_MS + FLOOR_ELEMENT_MS,
);
export const HEAVY_PLAYWRIGHT_TIMEOUT = Math.max(getMeasuredLaunchTimeoutMs(), FLOOR_LAUNCH_MS);
export const LOG_MARKER_WAIT_TIMEOUT = CUCUMBER_GLOBAL_TIMEOUT;
export const HEAVY_LOG_MARKER_WAIT_TIMEOUT = CUCUMBER_GLOBAL_TIMEOUT;
export const HEAVY_OPERATION_TIMEOUT = CUCUMBER_GLOBAL_TIMEOUT;

export const UI_RETRY_ATTEMPTS = Math.max(1, Math.round(CUCUMBER_GLOBAL_TIMEOUT / PLAYWRIGHT_TIMEOUT));
