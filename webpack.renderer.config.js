/* eslint-disable unicorn/prefer-module */
/* eslint-disable @typescript-eslint/no-var-requires */
const rules = require('./webpack.rules');
const plugins = require('./webpack.plugins');
const { webpackAlias } = require('./webpack.alias');

module.exports = {
  target: 'web',
  module: {
    rules,
  },
  plugins: plugins.renderer,
  resolve: {
    alias: webpackAlias,
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'],
    fallback: { crypto: false },
  },
  output: { chunkFilename: 'main_window/[name].chunk.js', publicPath: '../' },
  cache: {
    type: 'filesystem',
    buildDependencies: {
      config: [__filename],
    },
  },
};
