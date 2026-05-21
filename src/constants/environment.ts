import { isElectronDevelopment } from './isElectronDevelopment';
export { isElectronDevelopment };

// Packaged e2e runs do not reliably preserve NODE_ENV, so we also key off the explicit env var
// set by the E2E harness (TIDGI_TEST_SCENARIO). On Electron 41 Windows, custom CLI flags like
// --test-scenario are rejected at the binary level, so we use env vars instead.
export const isTest = process.env.NODE_ENV === 'test' || process.env.TIDGI_TEST_SCENARIO !== undefined;
export const isDevelopmentOrTest = isElectronDevelopment || isTest;
