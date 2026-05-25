module.exports = {
  default: {
    require: [
      'ts-node/register',
      'features/supports/**/!(*.test).ts',
      'features/stepDefinitions/**/*.ts',
    ],
    requireModule: ['ts-node/register'],
    format: ['progress'],
    formatOptions: {
      snippetInterface: 'async-await',
    },
    paths: ['features/*.feature'],
    tags: 'not @calibration-only',
    // Note: Global timeout is set via setDefaultTimeout() in features/supports/timeouts.ts
    // NOT via the 'timeout' config option here (which is for Cucumber's own operations)
    // Parallel disabled: Electron instances compete for CPU, making steps slower not faster.
  },
  calibration: {
    require: [
      'ts-node/register',
      'features/supports/**/!(*.test).ts',
      'features/stepDefinitions/**/*.ts',
    ],
    requireModule: ['ts-node/register'],
    format: ['progress'],
    formatOptions: {
      snippetInterface: 'async-await',
    },
    // Include features with steps that are prone to timeout under heavy load
    // (e.g., update workspace settings, watch-fs waits, git sync) so calibration
    // captures the true worst-case per-step duration.
    paths: [
      'features/smoke.feature',
      'features/sync.feature',
      'features/filesystemPlugin.feature',
      'features/crossWindowSync.feature',
      'features/gitLog.feature',
    ],
  },
};
