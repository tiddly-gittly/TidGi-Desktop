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
    timeout: 60000, // Increase timeout for CI
    retry: process.env.CI ? 1 : 0, // Retry once in CI
  },
};
