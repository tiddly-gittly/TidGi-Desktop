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
const styledComponentsTransformerFactory = require('typescript-plugin-styled-components').default;
const fs = require('fs');
const JSON5 = require('json5');

const isTest = process.env.NODE_ENV === 'test';
const isDevelopmentOrTest = process.env.NODE_ENV === 'development' || isTest;

module.exports = [
  {
    // used to load css from npm package, we use styled-components
    test: /\.css$/,
    use: [{ loader: 'style-loader' }, { loader: 'css-loader' }],
  },
  // TODO: until I have time to add https://github.com/linjiajian999/esbuild-plugin-import , only do this in development mode
  // eslint-disable-next-line no-constant-condition
  isDevelopmentOrTest
    ? {
      test: /\.(t|j)sx?$/,
      exclude: /(node_modules|\.webpack)/,
      use: {
        loader: 'esbuild-loader',
        options: {
          loader: 'tsx', // Or 'ts' if you don't need tsx
          /* ES2022/ESNEXT work well with inversifyjs, Wait until https://github.com/inversify/InversifyJS/pull/1499 fixed */
          target: 'ES2021',
          // tsconfigRaw: ts.readConfigFile('tsconfig.json', ts.sys.readFile.bind(ts.sys)),
          tsconfigRaw: JSON5.parse(fs.readFileSync('./tsconfig.json')),
        },
      },
    }
    : {
      test: /\.(t|j)sx?$/,
      exclude: /(node_modules|\.webpack)/,
      use: {
        loader: 'ts-loader',
        options: {
          transpileOnly: true,
          getCustomTransformers: () => ({
            before: [
              styledComponentsTransformerFactory(),
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
              // svg-icons
              // FIXME: will cause `FolderIcon is not defined`, which cannot reproduce in MacOS and dev mode https://github.com/tiddly-gittly/TidGi-Desktop/issues/88
              // tsImportPluginFactory({
              //   libraryDirectory: (importName) => {
              //     const stringVec = importName
              //       .split(/([A-Z][a-z]+|\d*)/)
              //       .filter((s) => s.length)
              //       .map((s) => s.toLocaleLowerCase());

              //     return stringVec.reduce((accumulator, current, index) => {
              //       if (index > 1) {
              //         return `${accumulator}-${current}`;
              //       } else if (index === 1) {
              //         return `${accumulator}/${current}`;
              //       }
              //       return accumulator + current;
              //     }, '');
              //   },
              //   libraryName: '@mui/icons-material',
              //   style: false,
              //   camel2DashComponentName: false,
              // }),
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
    },
  {
    test: /\.(woff(2)?|ttf|eot)(\?v=\d+\.\d+\.\d+)?$/,
    type: 'asset/resource',
    generator: {
      filename: 'fonts/[name].[ext]',
    },
  },
  {
    test: /\.(png|jpe?g|gif|svg)$/,
    type: 'asset/resource',
    generator: {
      filename: 'images/[name].[ext]',
    },
  },
  {
    test: /noflo(\\+|\/)lib(\\+|\/)loader(\\+|\/)register.js$/,
    use: [
      {
        loader: 'noflo-component-loader',
        options: {
          // Only include components used by this graph
          // Set to NULL if you want all installed components
          graph: null,
          // Whether to include the original component sources
          // in the build
          debug: true,
          baseDir: __dirname,
          manifest: {
            runtimes: ['noflo'],
            discover: true,
            recursive: true,
          },
          runtimes: [
            'noflo',
            'noflo-browser',
          ],
        },
      },
    ],
  },
  {
    test: /\.coffee$/,
    // load noflo-interaction standard lib, which provide some component in this format
    use: ['coffee-loader'],
  },
  {
    test: /\.fbp$/,
    // load noflo-strings standard lib, which provide some component in this format
    use: ['fbp-loader'],
  },
];
