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
    // Calibration discovers timeout-prone scenarios automatically via the
    // @calibrate tag. Add @calibrate to any scenario whose steps are heavy
    // (e.g., update workspace settings, watch-fs waits, git sync, restart).
    paths: ['features/*.feature'],
    tags: '@calibrate',
  },
};
