import { setDefaultTimeout } from '@cucumber/cucumber';
import { CUCUMBER_GLOBAL_TIMEOUT } from './timeouts';

console.log('[Timeout Config] Setting global timeout to:', CUCUMBER_GLOBAL_TIMEOUT, 'ms (CI:', Boolean(process.env.CI), 'platform:', process.platform, ')');

setDefaultTimeout(CUCUMBER_GLOBAL_TIMEOUT);
