import { setDefaultTimeout } from '@cucumber/cucumber';

const isCI = Boolean(process.env.CI);
const isMac = process.platform === 'darwin';

// Set global timeout for all steps and hooks
// Local: 5s (10s on macOS), CI: 25s
// macOS needs longer timeout for browser view loading
const globalTimeout = isCI ? 25000 : (isMac ? 10000 : 5000);

console.log('[Timeout Config] Setting global timeout to:', globalTimeout, 'ms (CI:', isCI, ', macOS:', isMac, ')');

setDefaultTimeout(globalTimeout);

/**
 * Centralized timeout configuration for E2E tests
 *
 * IMPORTANT: Most steps should NOT specify custom timeouts!
 * CucumberJS global timeout is configured in cucumber.config.js:
 * - Local: 5 seconds
 * - CI: 10 seconds (exactly 2x local)
 *
 * Only special operations (like complex browser view UI interactions) should
 * specify custom timeouts at the step level, with clear comments explaining why.
 *
 * If an operation times out, it indicates a performance issue that should be fixed,
 * not a timeout that should be increased.
 */

/**
 * Timeout for Playwright waitForSelector and similar operations
 * These are internal timeouts for finding elements, not Cucumber step timeouts
 */
export const PLAYWRIGHT_TIMEOUT = globalTimeout;

/**
 * Shorter timeout for operations that should be very fast
 * Local: 3s, CI: 15s
 */
export const PLAYWRIGHT_SHORT_TIMEOUT = isCI ? 15000 : 3000;

/**
 * Timeout for waiting log markers
 * Internal wait should be shorter than step timeout to allow proper error reporting
 * Local: 3s, CI: 15s
 */
export const LOG_MARKER_WAIT_TIMEOUT = isCI ? 15000 : 3000;
