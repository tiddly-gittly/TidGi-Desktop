import { isElectronDevelopment } from './isElectronDevelopment';
export { isElectronDevelopment };

// On Windows, Electron 41 rejects custom CLI flags at the binary level.
// Use TIDGI_TEST_SCENARIO env var (set by E2E harness) instead of --test-scenario CLI arg.
export const isTest = process.env.NODE_ENV === 'test' || process.env.TIDGI_TEST_SCENARIO !== undefined;
export const isDevelopmentOrTest = isElectronDevelopment || isTest;
