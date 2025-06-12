/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable unicorn/prefer-module */
/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');
const { webpackAlias } = require('./webpack.alias');

module.exports = {
  mode: 'development',
  target: 'node',
  devtool: 'cheap-module-source-map',
  
  module: {
    rules: [
      // TypeScript rules, keep consistent with main project config
      {
        test: /\.tsx?$/,
        exclude: /(node_modules|\.webpack)/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              transpileOnly: false,
              configFile: path.resolve(__dirname, 'tsconfig.json'),
            },
          },
        ],
      },
      // CSS rules - simple handling for tests
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      // Static assets handling - return filename in tests
      {
        test: /\.(png|jpe?g|gif|svg|ico)$/,
        type: 'asset/inline',
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/,
        type: 'asset/resource',
      },
    ],
  },
  
  resolve: {
    alias: webpackAlias,
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.json'],
    fallback: { 
      crypto: false, 
      fs: false, 
      process: false,
      path: require.resolve('path-browserify'),
    },
  },
  
  externals: {
    // Exclude Electron-specific modules in test environment
    'electron': 'commonjs electron',
    'tiddlywiki': 'commonjs tiddlywiki',
    'dugite': 'commonjs dugite',
    'better-sqlite3': 'commonjs better-sqlite3',
  },
  
  // Node.js settings for test environment
  node: {
    __filename: true,
    __dirname: true,
  },
};
