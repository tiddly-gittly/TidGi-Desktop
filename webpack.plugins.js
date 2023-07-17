/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
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
const WebpackBar = require('webpackbar');
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

exports.main = _.compact([
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
  new ExternalsPlugin({
    type: 'commonjs',
    // use regex works.
    include: /@tiddlygit\+tiddlywiki@(.+)|llama-node(.+)|@llama-node(.+)|dugite(.+)/,
    // when using npm, we can use this. But with pnpm, this won't work ↓
    // include: path.join(__dirname, 'node_modules', '.pnpm', '@tiddlygit', 'tiddlywiki'),
  }),
  new ThreadsPlugin({
    target: 'electron-node-worker',
    plugins: ['ExternalsPlugin'],
  }),
  process.env.NODE_ENV === 'production' ? undefined : new WebpackBar(),
  process.env.NODE_ENV === 'production'
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    ? new BundleAnalyzerPlugin({ generateStatsFile: true, analyzerMode: 'disabled', statsFilename: '../../out/webpack-stats-main.json' })
    : undefined,
]);

exports.renderer = _.compact([
  new webpack.DefinePlugin({
    'process.env.NODE_ENV': `"${process.env.NODE_ENV ?? 'production'}"`,
    // some noflo modules use process.env.NODE_DEBUG
    'process.env.NODE_DEBUG': 'false',
    // global: {},
  }),
  // new CspHtmlWebpackPlugin(
  //   {
  //     'base-uri': ["'self'"],
  //     'object-src': ["'none'"],
  //     'script-src': ["'self' 'unsafe-eval'"],
  //     'style-src': ["'self' 'unsafe-inline'"],
  //     'frame-src': ["'none'"],
  //     'worker-src': ["'none'"],
  //     'connect-src': ['https://api.github.com https://tidgi-desktop.authing.cn ws://localhost:3012'],
  //   },
  //   {
  //     nonceEnabled: {
  //       'style-src': false,
  //     },
  //   },
  // ),
  process.env.NODE_ENV === 'production' ? undefined : new WebpackBar(),
  process.env.NODE_ENV === 'production'
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    ? new BundleAnalyzerPlugin({ generateStatsFile: true, analyzerMode: 'disabled', statsFilename: '../../out/webpack-stats-renderer.json' })
    : undefined,
  new CopyPlugin({
    patterns: [
      // similar to noflo-ui's webpack.config.js
      {
        from: 'node_modules/klayjs/klay.js',
        to: 'webWorkers/klayjs/klay.js',
      },
    ],
  }),
]);
