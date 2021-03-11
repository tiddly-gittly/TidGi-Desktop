const tsImportPluginFactory = require('ts-import-plugin');

module.exports = [
  // Add support for native node modules
  {
    test: /\.node$/,
    use: 'node-loader',
  },
  // {
  //   test: /\.(m?js|node)$/,
  //   parser: { amd: true },
  //   use: {
  //     loader: '@zeit/webpack-asset-relocator-loader',
  //     options: {
  //       outputAssetBase: 'native_modules',
  //       emitDirnameAll: true,
  //     },
  //   },
  // },
  {
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
            tsImportPluginFactory({
              libraryDirectory: (importName) => {
                const stringVec = importName
                  .split(/([A-Z][a-z]+|[0-9]*)/)
                  .filter((s) => s.length)
                  .map((s) => s.toLocaleLowerCase());

                return stringVec.reduce((acc, cur, index) => {
                  if (index > 1) {
                    return acc + '-' + cur;
                  } else if (index === 1) {
                    return acc + '/' + cur;
                  }
                  return acc + cur;
                }, '');
              },
              libraryName: '@material-ui/icons',
              style: false,
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
          module: 'es2015',
        },
      },
    },
  },
  {
    test: /\.(woff(2)?|ttf|eot|svg)(\?v=\d+\.\d+\.\d+)?$/,
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
    test: /\.(png|jpe?g|gif)$/,
    use: [
      {
        loader: 'file-loader',
        options: {
          name: '[name].[ext]',
          outputPath: 'images/',
        },
      },
      {
        loader: 'image-webpack-loader',
        options: {
          query: {
            mozjpeg: {
              progressive: true,
            },
            gifsicle: {
              interlaced: true,
            },
            optipng: {
              optimizationLevel: 7,
            },
          },
        },
      },
    ],
  },
];
