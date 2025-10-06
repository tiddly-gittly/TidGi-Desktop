import path from 'path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vite';
import { workerPlugin } from '@fetsorn/vite-node-worker';

// https://vitejs.dev/config
export default defineConfig({
  plugins: [
    workerPlugin(),
    swc.vite({
      jsc: {
        parser: {
          syntax: 'typescript',
          decorators: true,
        },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
        target: 'es2021',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@services': path.resolve(__dirname, './src/services'),
    },
  },
  build: {
    rollupOptions: {
      // 根据官方文档，只外部化原生二进制模块和特殊依赖
      // https://www.electronforge.io/config/plugins/vite#native-node-modules
      external: [
        // Native binary modules - 必须外部化
        'better-sqlite3',
        'sqlite-vec',
        'registry-js',
        'dugite',

        // Large libraries with __filename/__dirname usage - 必须外部化
        'tiddlywiki',

        // Build tools with binary - 必须外部化
        'zx',
        'esbuild',

        // ESM modules with top-level await - 必须外部化
        'i18next-fs-backend',
        'i18next-electron-fs-backend',

        // Libraries with many optional dependencies - 必须外部化
        'typeorm',
      ],
    },
  },
});
