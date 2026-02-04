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
    // Note: Global timeout is set via setDefaultTimeout() in features/supports/timeout-config.ts
    // NOT via the 'timeout' config option here (which is for Cucumber's own operations)
    // Parallel execution disabled due to OOM issues on Windows
    // Each scenario still gets isolated test-artifacts/{scenarioSlug}/ directory
    // parallel: 2,
  },
};
