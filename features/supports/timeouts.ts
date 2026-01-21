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

const isCI = Boolean(process.env.CI);

/**
 * Timeout for Playwright waitForSelector and similar operations
 * These are internal timeouts for finding elements, not Cucumber step timeouts
 * Local: 5s, CI: 10s
 */
export const PLAYWRIGHT_TIMEOUT = isCI ? 10000 : 5000;

/**
 * Shorter timeout for operations that should be very fast
 * Local: 3s, CI: 6s
 */
export const PLAYWRIGHT_SHORT_TIMEOUT = isCI ? 6000 : 3000;

/**
 * Timeout for waiting log markers
 * Internal wait should be shorter than step timeout to allow proper error reporting
 * Local: 3s, CI: 6s
 */
export const LOG_MARKER_WAIT_TIMEOUT = isCI ? 6000 : 3000;
