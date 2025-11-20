import { isTest } from './environment';

/**
 * Protocol scheme used for deep linking
 * Test mode uses a different protocol to avoid conflicts with production
 *
 * Note: This file is for main process only, not for renderer/shared code
 */
export const TIDGI_PROTOCOL_SCHEME = isTest ? 'tidgi-test' : 'tidgi';
