const isCI = Boolean(process.env.CI);

// Debug: Log CI detection for troubleshooting timeout issues
console.log('[Cucumber Config] CI environment variable:', process.env.CI);
console.log('[Cucumber Config] isCI:', isCI);
console.log('[Cucumber Config] Timeout will be:', isCI ? 25000 : 5000, 'ms');

module.exports = {
  default: {
    require: [
      'ts-node/register',
      'features/stepDefinitions/**/*.ts',
    ],
    requireModule: ['ts-node/register'],
    format: ['progress'],
    formatOptions: {
      snippetInterface: 'async-await',
    },
    paths: ['features/*.feature'],
    // Global timeout for all steps
    // Local: 5s, CI: 25s (5x local)
    // Individual steps should NOT specify custom timeouts unless they have special needs
    timeout: isCI ? 25000 : 5000,
    // Parallel execution disabled due to OOM issues on Windows
    // Each scenario still gets isolated test-artifacts/{scenarioSlug}/ directory
    // parallel: 2,
  },
};
