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
    // Parallel execution disabled due to OOM issues on Windows
    // Each scenario still gets isolated test-artifacts/{scenarioSlug}/ directory
    // parallel: 2,
  },
};
