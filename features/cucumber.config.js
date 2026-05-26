const fs = require('fs');

/**
 * When TIDGI_E2E_SHARD=N/M is set, split .feature files into N stable groups
 * and only return paths for shard M (1-indexed). Stability is guaranteed by
 * alphabetical sorting — same file always lands in the same shard regardless
 * of filesystem ordering or OS.
 */
function computeShardedPaths() {
  const shard = process.env.TIDGI_E2E_SHARD;
  if (!shard) {
    return ['features/*.feature'];
  }

  const parts = shard.split('/');
  if (parts.length !== 2) {
    console.warn(`[TIDGI_E2E_SHARD] Invalid format "${shard}", expected N/M — running all scenarios`);
    return ['features/*.feature'];
  }

  const total = Number(parts[0]);
  const index = Number(parts[1]);

  if (!Number.isInteger(total) || !Number.isInteger(index) || total < 1 || index < 1 || index > total) {
    console.warn(`[TIDGI_E2E_SHARD] Invalid shard ${index}/${total} — running all scenarios`);
    return ['features/*.feature'];
  }

  const allFiles = fs.readdirSync(__dirname)
    .filter(f => f.endsWith('.feature'))
    .sort();

  if (allFiles.length === 0) {
    console.warn('[TIDGI_E2E_SHARD] No .feature files found');
    return [];
  }

  const chunkSize = Math.ceil(allFiles.length / total);
  const start = (index - 1) * chunkSize;
  const shardFiles = allFiles.slice(start, start + chunkSize);

  console.log(
    `[TIDGI_E2E_SHARD] Shard ${index}/${total}: ` +
    `files ${start + 1}-${Math.min(start + chunkSize, allFiles.length)} of ${allFiles.length} ` +
    `(${shardFiles.map(f => f.replace('.feature', '')).join(', ')})`
  );

  return shardFiles.map(f => `features/${f}`);
}

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
    paths: computeShardedPaths(),
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
    // Calibration always runs ALL .feature files (the @calibrate tag filters
    // which scenarios execute), so sharding does NOT apply here — every shard
    // needs the shared .calibration.json.
    paths: ['features/*.feature'],
    tags: '@calibrate',
  },
};
