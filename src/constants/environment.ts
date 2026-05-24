import { isElectronDevelopment } from './isElectronDevelopment';
export { isElectronDevelopment };

// On Windows, Electron 41 rejects custom CLI flags when invoking the packaged
// binary directly (e.g. `TidGi.exe --some-flag`). This does NOT affect
// `electron-forge start -- --some-flag` (dev mode), which passes through properly.
// Use TIDGI_TEST_SCENARIO env var (set by E2E harness) instead of --test-scenario.
export const isTest = process.env.NODE_ENV === 'test' || process.env.TIDGI_TEST_SCENARIO !== undefined;
export const isDevelopmentOrTest = isElectronDevelopment || isTest;
