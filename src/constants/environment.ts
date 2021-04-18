import isDevelopment from 'electron-is-dev';

export const isTest = process.env.NODE_ENV === 'test';
export const isDevelopmentOrTest = isDevelopment || isTest;
