/**
 * Protocol scheme used for deep linking.
 *
 * Keep this file renderer-safe: do not import `environment.ts` here because that
 * transitively imports Electron-only code via `isElectronDevelopment`.
 */
const isTestProtocol = process.env.NODE_ENV === 'test' || process.env.TIDGI_TEST_SCENARIO !== undefined;

export const TIDGI_PROTOCOL_SCHEME = isTestProtocol ? 'tidgi-test' : 'tidgi';
