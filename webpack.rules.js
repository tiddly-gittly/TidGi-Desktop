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
    test: /\.(t|j)sx?$/,
    exclude: /(node_modules|\.webpack)/,
    use: {
      loader: 'ts-loader',
      options: {
        transpileOnly: true,
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
];
