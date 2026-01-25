import { setDefaultTimeout } from '@cucumber/cucumber';

const isCI = Boolean(process.env.CI);

// Set global timeout for all steps and hooks
// Local: 5s, CI: 25s
const globalTimeout = isCI ? 25000 : 5000;

console.log('[Timeout Config] Setting global timeout to:', globalTimeout, 'ms (CI:', isCI, ')');

setDefaultTimeout(globalTimeout);
