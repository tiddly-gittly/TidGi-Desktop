module.exports = {
  default: {
    require: [
      'ts-node/register',
      'features/stepDefinitions/**/*.ts',
    ],
    requireModule: ['ts-node/register'],
    format: process.env.CI ? ['progress', 'json:cucumber-report.json'] : ['progress'],
    formatOptions: {
      snippetInterface: 'async-await',
    },
    paths: ['features/*.feature'],
    // Set longer timeout for CI environment
    timeout: process.env.CI ? 120000 : 30000, // 2 minutes for CI, 30 seconds locally
    // Enable more verbose output in CI
    ...(process.env.CI && {
      retry: 0, // Disable retries to see exact failure
      parallel: 1, // Ensure single-threaded execution
    }),
  },
};
