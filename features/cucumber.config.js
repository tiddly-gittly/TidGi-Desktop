const isCI = Boolean(process.env.CI);

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
    // Local: 5s, CI: 10s (exactly 2x local)
    // Individual steps should NOT specify custom timeouts unless they have special needs
    timeout: isCI ? 10000 : 5000,
    // Parallel execution disabled due to OOM issues on Windows
    // Each scenario still gets isolated test-artifacts/{scenarioSlug}/ directory
    // parallel: 2,
  },
};
