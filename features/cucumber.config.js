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
    // Note: Global timeout is set via setDefaultTimeout() in features/supports/timeouts.ts
    // NOT via the 'timeout' config option here (which is for Cucumber's own operations)
    // Parallel on CI (7 GB RAM, enough for 2 Electron instances);
    // disabled locally where Windows OOM is more likely.
    ...(isCI ? { parallel: 2 } : {}),
  },
};
