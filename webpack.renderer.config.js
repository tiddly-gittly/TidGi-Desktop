/* eslint-disable @typescript-eslint/no-var-requires */
const rules = require('./webpack.rules');
const plugins = require('./webpack.plugins');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'webpackAli... Remove this comment to see the full error message
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
  },
};
