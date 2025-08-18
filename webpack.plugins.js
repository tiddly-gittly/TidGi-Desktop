/* eslint-disable @typescript-eslint/no-require-imports */

const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const CircularDependencyPlugin = require('circular-dependency-plugin');
const _ = require('lodash');
const { EsbuildPlugin } = require('esbuild-loader');
const CopyPlugin = require('copy-webpack-plugin');
const ThreadsPlugin = require('threads-plugin');
const ExternalsPlugin = require('webpack5-externals-plugin');
const WebpackBar = require('webpackbar');

const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const { isDevelopmentOrTest } = require('./webpack.rules');

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
  new EsbuildPlugin({
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    },
  }),
  new ExternalsPlugin({
    type: 'commonjs',
    // use regex works.
    // include: /@tiddlygit\+tiddlywiki@(.+)|dugite(.+)/,
    include: /tiddlywiki(.+)|dugite(.+)/,
    // when using npm, we can use this. But with pnpm, this won't work ↓
    // include: path.join(__dirname, 'node_modules', '.pnpm', '@tiddlygit', 'tiddlywiki'),
  }),
  process.platform === 'win32'
    ? undefined
    : new ExternalsPlugin({
      type: 'commonjs',
      include: /registry-js(.+)/,
    }),
  new ThreadsPlugin({
    target: 'electron-node-worker',
    plugins: ['ExternalsPlugin'],
  }),
  // WebpackBar progress bar need `DEBUG=electron-forge:*` to work.
  isDevelopmentOrTest ? new WebpackBar() : undefined,
  isDevelopmentOrTest
    ? undefined
    : new BundleAnalyzerPlugin({
      generateStatsFile: true,
      analyzerMode: 'disabled',
      statsFilename: '../../out/webpack-stats-main.json',
    }),
]);

exports.renderer = _.compact([
  new EsbuildPlugin({
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    },
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
  isDevelopmentOrTest
    ? undefined
    : new BundleAnalyzerPlugin({
      generateStatsFile: true,
      analyzerMode: 'disabled',
      statsFilename: '../../out/webpack-stats-renderer.json',
    }),
  // WebpackBar progress bar need `DEBUG=electron-forge:*` to work.
  isDevelopmentOrTest ? new WebpackBar() : undefined,
  // Example: copy files for webWorker to use
  // new CopyPlugin({
  //   patterns: [
  //     // similar to noflo-ui's webpack.config.js
  //     {
  //       from: 'node_modules/klayjs/klay.js',
  //       to: 'webWorkers/klayjs/klay.js',
  //     },
  //   ],
  // }),
]);
