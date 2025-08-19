/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

const tsImportPluginFactory = require('ts-import-plugin');
const fs = require('fs');
const JSON5 = require('json5');

const isTest = process.env.NODE_ENV === 'test';
const isDevelopmentOrTest = process.env.NODE_ENV === 'development' || isTest;

// shared asset rules
const assetRules = [
  {
    test: /\.(woff(2)?|ttf|eot)(\?v=\d+\.\d+\.\d+)?$/,
    type: 'asset',
  },
  {
    test: /\.(png|jpe?g|gif|svg)$/,
    type: 'asset',
  },
];

const cssRule = {
  // used to load css from npm package, we use styled-components but some dependencies may require css files
  test: /\.css$/,
  use: [{ loader: 'style-loader' }, { loader: 'css-loader' }],
};

const nativeRules = [
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
];

// ts-loader based rule used for main process (safer for node/electron main)
const tsLoaderRule = {
  test: /\.(t|j)sx?$/,
  exclude: /(node_modules|\.webpack)/,
  use: {
    loader: 'ts-loader',
    options: {
      transpileOnly: true,
      getCustomTransformers: () => ({
        before: [
          // lodash
          tsImportPluginFactory({
            style: false,
            libraryName: 'lodash',
            libraryDirectory: null,
            camel2DashComponentName: false,
          }),
          // material-ui
          tsImportPluginFactory({
            libraryName: '@mui/material',
            libraryDirectory: '',
            camel2DashComponentName: false,
          }),
          // RXJS
          tsImportPluginFactory([
            {
              libraryDirectory: '../_esm5/internal/operators',
              libraryName: 'rxjs/operators',
              camel2DashComponentName: false,
              transformToDefaultImport: false,
            },
            {
              libraryDirectory: '../_esm5/internal/observable',
              libraryName: 'rxjs',
              camel2DashComponentName: false,
              transformToDefaultImport: false,
            },
          ]),
        ],
      }),
      compilerOptions: {
        module: 'esnext',
      },
    },
  },
};

// esbuild-loader based rule for renderer to speed up dev builds
const esbuildLoaderRule = {
  test: /\.(t|j)sx?$/,
  exclude: /(node_modules|\.webpack)/,
  loader: 'esbuild-loader',
  options: {
    loader: 'tsx',
    target: 'ES2022',
    tsconfigRaw: JSON5.parse(fs.readFileSync('./tsconfig.json')),
  },
};

module.exports = {
  renderer: [cssRule, isDevelopmentOrTest ? esbuildLoaderRule : tsLoaderRule, ...assetRules],
  main: [...nativeRules, tsLoaderRule],
  isDevelopmentOrTest,
};
