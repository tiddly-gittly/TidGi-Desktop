const webpack = require('webpack');
const MemoryFS = require('memory-fs');
const webpackConfig = require('./webpack.test.config');

class WebpackTransformer {
  constructor() {
    this.memoryFs = new MemoryFS();
  }

  process(src, filename, config) {
    return new Promise((resolve, reject) => {
      const compiler = webpack({
        ...webpackConfig,
        entry: filename,
        output: {
          path: '/',
          filename: 'bundle.js',
          libraryTarget: 'commonjs2',
        },
        mode: 'development',
      });

      compiler.outputFileSystem = this.memoryFs;

      compiler.run((err, stats) => {
        if (err || stats.hasErrors()) {
          reject(err || new Error(stats.compilation.errors.join('\n')));
          return;
        }

        try {
          const output = this.memoryFs.readFileSync('/bundle.js', 'utf8');
          resolve(output);
        } catch (readErr) {
          reject(readErr);
        }
      });
    });
  }
}

// Jest 同步转换器
module.exports = {
  process(src, filename) {
    // 对于简单的 JS 文件，直接返回
    if (filename.endsWith('.js')) {
      return src;
    }

    // 对于复杂的 TS 文件，使用 ts-loader（同步版本）
    const ts = require('typescript');
    const tsConfig = require('./tsconfig.json');
    
    const result = ts.transpile(src, {
      ...tsConfig.compilerOptions,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      jsx: ts.JsxEmit.React,
    });

    return result;
  },
};
