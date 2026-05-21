import { setDefaultTimeout } from '@cucumber/cucumber';
import { getMeasuredStepTimeoutMs } from './calibration';

const isCI = process.env.CI;

export const CUCUMBER_GLOBAL_TIMEOUT = getMeasuredStepTimeoutMs();
console.log(`[Timeout] step=${CUCUMBER_GLOBAL_TIMEOUT}ms (CI=${isCI})`);
setDefaultTimeout(CUCUMBER_GLOBAL_TIMEOUT);
