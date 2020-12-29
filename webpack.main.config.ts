/* eslint-disable @typescript-eslint/no-var-requires */
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'webpackAli... Remove this comment to see the full error message
const { webpackAlias } = require('./webpack.alias');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: './src/main.ts',
  // Put your normal webpack config below here
  module: {
    rules: require('./webpack.rules'),
  },
  plugins: [
    new CopyPlugin({
      // to is relative to ./.webpack/main/
      patterns: [{ from: 'src/services/libs/wiki/wiki-worker.js', to: 'wiki-worker.js' }],
    }),
  ],
  resolve: {
    alias: webpackAlias,
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.json'],
  },
  node: {
    __filename: true,
    __dirname: true,
  },
};
