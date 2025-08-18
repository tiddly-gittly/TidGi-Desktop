/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
const { renderer: rules, isDevelopmentOrTest } = require('./webpack.rules');
const { renderer: plugins } = require('./webpack.plugins');
const { webpackAlias } = require('./webpack.alias');

module.exports = {
  mode: isDevelopmentOrTest ? 'development' : 'production',
  target: 'web',
  module: {
    rules,
  },
  plugins,
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
  cache: isDevelopmentOrTest
    ? {
      type: 'filesystem',
      compression: false,
      buildDependencies: {
        config: [__filename],
      },
    }
    : false,
  ...(isDevelopmentOrTest
    ? {
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
    }
    : {}),
  // In dev use the fastest eval source for quicker rebuilds unless React debugging
  // is explicitly requested via DEBUG_REACT env var.
  devtool: isDevelopmentOrTest ? 'eval-cheap-module-source-map' : 'source-map',
};
