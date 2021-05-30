/* eslint-disable unicorn/prefer-module */
/* eslint-disable @typescript-eslint/no-var-requires */
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const CspHtmlWebpackPlugin = require('csp-html-webpack-plugin');
const CircularDependencyPlugin = require('circular-dependency-plugin');
const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');
const ThreadsPlugin = require('threads-plugin');

exports.main = [
  // we only need one instance of TsChecker, it will check main and renderer all together
  new ForkTsCheckerWebpackPlugin(),
  new CopyPlugin({
    // to is relative to ./.webpack/main/
    patterns: [{ from: 'localization', to: 'localization' }],
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
  new ThreadsPlugin({
    target: 'electron-node-worker',
  }),
];

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
