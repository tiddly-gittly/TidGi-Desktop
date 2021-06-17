/* eslint-disable unicorn/prefer-module */
/* eslint-disable @typescript-eslint/no-var-requires */
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const CspHtmlWebpackPlugin = require('csp-html-webpack-plugin');
const CircularDependencyPlugin = require('circular-dependency-plugin');
const _ = require('lodash');
const path = require('path');
const fs = require('fs-extra');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');
const ThreadsPlugin = require('threads-plugin');
const ExternalsPlugin = require('webpack5-externals-plugin');
const EventHooksPlugin = require('event-hooks-webpack-plugin');

exports.main = _.compact([
  // we only need one instance of TsChecker, it will check main and renderer all together
  new ForkTsCheckerWebpackPlugin(),
  new CopyPlugin({
    // to is relative to ./.webpack/main/
    patterns: [{ from: 'localization', to: 'localization' }],
  }),
  ['production', 'test'].includes(process.env.NODE_ENV) &&
    new EventHooksPlugin({
      afterEmit: async (compilation, done) => {
        console.log('Copying tiddlywiki dependency to dist');
        await fs.copy('node_modules/@tiddlygit/tiddlywiki', './.webpack/node_modules/@tiddlygit/tiddlywiki');
        await fs.copy('node_modules/dugite/git', './.webpack/node_modules/dugite/git');
      },
    }),
  new CircularDependencyPlugin({
    // exclude detection of files based on a RegExp
    exclude: /node_modules/,
    // add errors to webpack instead of warnings
    failOnError: true,
    // allow import cycles that include an asyncronous import,
    // e.g. via import(/* webpackMode: "weak" */ './file.js')
    allowAsyncCycles: true,
    // set the current working directory for displaying module paths
    cwd: process.cwd(),
  }),
  new webpack.DefinePlugin({
    'process.env.NODE_ENV': `"${process.env.NODE_ENV ?? 'production'}"`,
  }),
  new ExternalsPlugin({
    type: 'commonjs',
    include: path.join(__dirname, 'node_modules', '@tiddlygit', 'tiddlywiki'),
  }),
  new ThreadsPlugin({
    target: 'electron-node-worker',
    plugins: ['ExternalsPlugin'],
  }),
]);

exports.renderer = [
  new webpack.DefinePlugin({
    'process.env.NODE_ENV': `"${process.env.NODE_ENV ?? 'production'}"`,
    // global: {},
  }),
  new CspHtmlWebpackPlugin(
    {
      'base-uri': ["'self'"],
      'object-src': ["'none'"],
      'script-src': ["'self' 'unsafe-eval'"],
      'style-src': ["'self' 'unsafe-inline'"],
      'frame-src': ["'none'"],
      'worker-src': ["'none'"],
    },
    {
      nonceEnabled: {
        'style-src': false,
      },
    },
  ),
];
