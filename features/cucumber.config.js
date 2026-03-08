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
    // Parallel disabled: Electron instances compete for CPU, making steps slower not faster.
  },
};
