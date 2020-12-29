/* eslint-disable @typescript-eslint/no-var-requires */
const rules = require('./webpack.rules');
const plugins = require('./webpack.plugins');
const { webpackAlias } = require('./webpack.alias');

module.exports = {
  target: 'web',
  module: {
    rules,
  },
  plugins: plugins,
  resolve: {
    alias: webpackAlias,
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'],
  },
};
