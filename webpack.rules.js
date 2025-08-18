/* eslint-disable security/detect-unsafe-regex */
/* eslint-disable unicorn/prefer-module */
/* eslint-disable unicorn/no-null */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/restrict-plus-operands */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-return */
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
  // used to load css from npm package, we use styled-components
  test: /\.css$/,
  use: [{ loader: 'style-loader' }, { loader: 'css-loader' }],
};

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
  use: isDevelopmentOrTest
    ? {
        loader: 'esbuild-loader',
        options: {
          loader: 'tsx',
          target: 'ES2022',
          tsconfigRaw: JSON5.parse(fs.readFileSync('./tsconfig.json')),
        },
      }
    : tsLoaderRule.use,
};

module.exports = {
  renderer: [cssRule, esbuildLoaderRule, ...assetRules],
  main: [cssRule, tsLoaderRule, ...assetRules],
  isDevelopmentOrTest,
};
