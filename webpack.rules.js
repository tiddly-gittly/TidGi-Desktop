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

module.exports = [
  {
    // used to load css from npm package, we use styled-components
    test: /\.css$/,
    use: [{ loader: 'style-loader' }, { loader: 'css-loader' }],
  },
  {
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
              libraryName: '@material-ui/core',
              libraryDirectory: '',
              camel2DashComponentName: false,
            }),
            // svg-icons
            // FIXME: will cause `FolderIcon is not defined`, which cannot reproduce in MacOS and dev mode https://github.com/tiddly-gittly/TiddlyGit-Desktop/issues/88
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
            //   libraryName: '@material-ui/icons',
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
    use: [
      {
        loader: 'file-loader',
        options: {
          name: '[name].[ext]',
          outputPath: 'fonts/',
        },
      },
    ],
  },
  {
    test: /\.(png|jpe?g|gif|svg)$/,
    use: [
      {
        loader: 'file-loader',
        options: {
          name: '[name].[ext]',
          outputPath: 'images/',
        },
      },
    ],
  },
];
