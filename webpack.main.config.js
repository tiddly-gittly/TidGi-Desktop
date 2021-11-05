/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable unicorn/prefer-module */
/* eslint-disable @typescript-eslint/no-var-requires */
const { webpackAlias } = require('./webpack.alias');
const plugins = require('./webpack.plugins');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  target: 'electron-main',
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: './src/main.ts',
  // Put your normal webpack config below here
  module: {
    rules: [
      {
        // We're specifying native_modules in the test because the asset relocator loader generates a
        // "fake" .node file which is really a cjs file.
        test: /native_modules\/.+\.node$/,
        use: 'node-loader',
      },
      {
        test: /\.(m?js|node)$/,
        parser: { amd: false },
        use: {
          loader: '@vercel/webpack-asset-relocator-loader',
          options: {
            outputAssetBase: 'native_modules',
          },
        },
      },
      ...require('./webpack.rules'),
    ],
  },
  plugins: plugins.main,
  resolve: {
    alias: webpackAlias,
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.json'],
  },
  externals: [
    // TODO: simply external things will make require can't find things. May need some other way.
    // nodeExternals({
    //   additionalModuleDirs: ['@tiddlygit/tiddlywiki'],
    //   allowlist: [/(threads-plugin)/],
    // }),
  ],
  // externalsType: 'commonjs',
  // externalsPresets: { electronMain: true },
  node: {
    __filename: true,
    __dirname: true,
  },
  cache: {
    type: 'filesystem',
    buildDependencies: {
      config: [__filename],
    },
  },
};
