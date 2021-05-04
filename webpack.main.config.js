/* eslint-disable unicorn/prefer-module */
/* eslint-disable @typescript-eslint/no-var-requires */
const { webpackAlias } = require('./webpack.alias');
const plugins = require('./webpack.plugins');

module.exports = {
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: './src/main.ts',
  // Put your normal webpack config below here
  module: {
    rules: [
      ...require('./webpack.rules'),
      {
        test: /\.(m?js|node)$/,
        parser: { amd: true },
        use: {
          loader: '@zeit/webpack-asset-relocator-loader',
          options: {
            outputAssetBase: 'native_modules',
            emitDirnameAll: true,
          },
        },
      },
    ],
  },
  plugins: plugins.main,
  resolve: {
    alias: webpackAlias,
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.json'],
  },
  node: {
    __filename: true,
    __dirname: true,
  },
};
