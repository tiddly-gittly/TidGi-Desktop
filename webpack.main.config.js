/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

const { webpackAlias } = require('./webpack.alias');
const { main: plugins } = require('./webpack.plugins');
const { main: rules, isDevelopmentOrTest } = require('./webpack.rules');

module.exports = {
  target: 'electron-main',
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: './src/main.ts',
  // Put your normal webpack config below here
  module: {
    rules,
  },
  plugins,
  resolve: {
    alias: webpackAlias,
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.json'],
  },
  output: {
    devtoolModuleFilenameTemplate: (info) => {
      return `file:///${encodeURI(info.absoluteResourcePath)}`;
    },
  },
  // main process doesn't need watch in dev; electron-forge restarts main when rebuilt
  watch: false,
  externals: [
    // simply external all things will make require can't find things. Only exclude what we copied in scripts/afterPack.js
    // nodeExternals({
    //   additionalModuleDirs: ['tiddlywiki'],
    //   allowlist: [/(threads-plugin)/],
    // }),
    'tiddlywiki',
    'dugite',
    'zx',
    ...(process.platform === 'win32' ? [] : ['registry-js']),
  ],
  // externalsType: 'commonjs',
  // externalsPresets: { electronMain: true },
  node: {
    __filename: true,
    __dirname: true,
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
};
