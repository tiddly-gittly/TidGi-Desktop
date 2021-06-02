import { isElectronDevelopment } from './isElectronDevelopment';

export const isTest = process.env.NODE_ENV === 'test';
export const isDevelopmentOrTest = isElectronDevelopment || isTest;
