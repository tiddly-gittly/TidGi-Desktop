import { setDefaultTimeout } from '@cucumber/cucumber';
import { getMeasuredElementTimeoutMs, getMeasuredLaunchTimeoutMs, getMeasuredStepTimeoutMs } from './calibration';

export const CUCUMBER_GLOBAL_TIMEOUT = getMeasuredStepTimeoutMs();
setDefaultTimeout(CUCUMBER_GLOBAL_TIMEOUT);

export const PLAYWRIGHT_SHORT_TIMEOUT = getMeasuredElementTimeoutMs();
export const HEAVY_PLAYWRIGHT_TIMEOUT = getMeasuredLaunchTimeoutMs();
export const PLAYWRIGHT_TIMEOUT = getMeasuredLaunchTimeoutMs() + getMeasuredElementTimeoutMs();
export const LOG_MARKER_WAIT_TIMEOUT = CUCUMBER_GLOBAL_TIMEOUT;
export const HEAVY_LOG_MARKER_WAIT_TIMEOUT = CUCUMBER_GLOBAL_TIMEOUT;
export const HEAVY_OPERATION_TIMEOUT = CUCUMBER_GLOBAL_TIMEOUT;

export const UI_RETRY_ATTEMPTS = Math.max(3, Math.round(CUCUMBER_GLOBAL_TIMEOUT / PLAYWRIGHT_TIMEOUT));
