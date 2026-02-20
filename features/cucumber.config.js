const isCI = Boolean(process.env.CI);
const isMac = process.platform === 'darwin';
const timeoutForCurrentEnvironment = (isCI || isMac) ? 25000 : 5000;

// Debug: Log CI detection for troubleshooting timeout issues
console.log('[Cucumber Config] CI environment variable:', process.env.CI);
console.log('[Cucumber Config] isCI:', isCI);
console.log('[Cucumber Config] platform:', process.platform);
console.log('[Cucumber Config] Timeout will be:', timeoutForCurrentEnvironment, 'ms');

module.exports = {
  default: {
    require: [
      'ts-node/register',
      'features/supports/timeout-config.ts', // Must be loaded first to set global timeout
      'features/stepDefinitions/**/*.ts',
    ],
    requireModule: ['ts-node/register'],
    format: ['progress'],
    formatOptions: {
      snippetInterface: 'async-await',
    },
    paths: ['features/*.feature'],
    // Note: Global timeout is set via setDefaultTimeout() in features/supports/timeout-config.ts
    // NOT via the 'timeout' config option here (which is for Cucumber's own operations)
    // Parallel execution disabled due to OOM issues on Windows
    // Each scenario still gets isolated test-artifacts/{scenarioSlug}/ directory
    // parallel: 2,
  },
};
