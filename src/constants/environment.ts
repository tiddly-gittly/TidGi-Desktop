import { isElectronDevelopment } from './isElectronDevelopment';

export const isTest = process.env.NODE_ENV === 'test';
export const isE2ETest = process.env.E2E_TEST === 'true';
export const isDevelopmentOrTest = isElectronDevelopment || isTest || isE2ETest;