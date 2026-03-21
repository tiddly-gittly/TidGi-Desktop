import { isElectronDevelopment } from './isElectronDevelopment';
export { isElectronDevelopment };

const hasTestScenarioArgument = process.argv.some((argument) => argument.startsWith('--test-scenario='));

// Packaged e2e runs do not reliably preserve NODE_ENV, so we also key off the explicit scenario arg.
export const isTest = process.env.NODE_ENV === 'test' || hasTestScenarioArgument;
export const isDevelopmentOrTest = isElectronDevelopment || isTest;
