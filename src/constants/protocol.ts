/**
 * Protocol scheme used for deep linking and wiki content serving.
 *
 * This file is renderer-safe (no process.env or Electron imports).
 * Main process files that need test-mode differentiation ('tidgi-test')
 * should import `isTest` from `@/constants/environment` and compute locally.
 */
export const TIDGI_PROTOCOL_SCHEME = 'tidgi';
