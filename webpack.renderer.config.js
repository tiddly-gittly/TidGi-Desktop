/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable unicorn/prefer-module */
/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');
const os = require('os');
const { renderer: rules, isDevelopmentOrTest } = require('./webpack.rules');
const plugins = require('./webpack.plugins');
const { webpackAlias } = require('./webpack.alias');

module.exports = {
  mode: isDevelopmentOrTest ? 'development' : 'production',
  target: 'web',
  module: {
    rules,
  },
  plugins: plugins.renderer,
  resolve: {
    alias: webpackAlias,
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'],
    fallback: { crypto: false, fs: false, process: false },
    symlinks: false,
    cacheWithContext: false,
  },
  output: {
    chunkFilename: 'main_window/[name].chunk.js',
    publicPath: '../',
    devtoolModuleFilenameTemplate: (info) => {
      return `file:///${encodeURI(info.absoluteResourcePath)}`;
    },
  },
  cache: isDevelopmentOrTest ? {
    type: 'filesystem',
    // Use a repository-local cache directory (persistent between reboots)
    // and disable compression for faster reads/writes during development.
    cacheDirectory: path.join(__dirname, '.webpack', 'renderer'),
    compression: false,
    buildDependencies: {
      config: [__filename],
    },
  } : {
    type: 'filesystem',
    buildDependencies: {
      config: [__filename],
    },
  },
  ...(isDevelopmentOrTest ? {
    watchOptions: {
      ignored: /node_modules/,
      aggregateTimeout: 300,
      poll: 1000,
    },
    performance: { hints: false },
    // Tweak devServer to reduce runtime noise and some overhead during development.
    devServer: {
      client: {
        logging: 'none',
        overlay: false,
      },
      hot: true,
      liveReload: false,
      compress: true,
    },
  } : {}),
  // In dev use the fastest eval source for quicker rebuilds unless React debugging
  // is explicitly requested via DEBUG_REACT env var.
  devtool: isDevelopmentOrTest ? 'eval-cheap-module-source-map' : 'source-map',
  // reduce extra optimization work in dev for faster incremental builds
  optimization: isDevelopmentOrTest ? {
    runtimeChunk: true,
    // avoid expensive module/chunk analysis in dev
    removeAvailableModules: false,
    removeEmptyChunks: false,
    splitChunks: false,
  } : {},
};
