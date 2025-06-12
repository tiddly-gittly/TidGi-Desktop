module.exports = {
  default: {
    require: [
      'ts-node/register',
      'features/stepDefinitions/**/*.ts',
    ],
    requireModule: ['ts-node/register'],
    format: ['progress', 'json:logs/cucumber-report.json'],
    formatOptions: {
      snippetInterface: 'async-await',
    },
    paths: ['features/*.feature'],
    timeout: 120000, // Increase timeout to 2 minutes for CI
    retry: process.env.CI ? 2 : 0, // Retry twice in CI due to potential timing issues
    retryTagFilter: '@smoke', // Only retry smoke tests
  },
};
