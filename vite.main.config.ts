import path from 'path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vite';
import { workerPlugin } from '@fetsorn/vite-node-worker';

// https://vitejs.dev/config
export default defineConfig({
  plugins: [
    workerPlugin(),
    // Use SWC to handle TypeScript decorators with metadata
    // This is the same configuration used in vitest.config.ts
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
      // 根据官方文档，外部化原生模块和大型库
      // https://www.electronforge.io/config/plugins/vite#native-node-modules
      external: [
        // Native modules - 必须外部化
        'better-sqlite3',
        'sqlite3',
        'sqlite-vec',
        'registry-js',
        'dugite',
        
        // Large libraries - 外部化以加速构建
        'tiddlywiki',
        'typeorm',
        
        // ESM modules with top-level await
        'i18next-fs-backend',
        'i18next-electron-fs-backend',
        
        // Build tools
        'zx',
        'esbuild',
      ],
    },
  },
});
