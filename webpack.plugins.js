/* eslint-disable @typescript-eslint/no-var-requires */
const webpack = require('webpack');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const CspHtmlWebpackPlugin = require('csp-html-webpack-plugin');

module.exports = [
  new ForkTsCheckerWebpackPlugin(),
  new webpack.DefinePlugin({
    'process.env': '{}',
    global: {},
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
