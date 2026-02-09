import path from 'path';
import { defineConfig } from 'tsup';

const srcRoot = path.resolve(__dirname, '../../src');

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: {
    // Allow DTS generation to continue even with errors from upstream source files
    // that rely on more precise type stubs (e.g. tiddlywiki boot.files indexing)
    compilerOptions: {
      skipLibCheck: true,
      noImplicitAny: false,
    },
  },
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  esbuildOptions(options) {
    options.alias = {
      '@services': path.join(srcRoot, 'services'),
      '@': srcRoot,
    };
  },
  // Don't bundle these — consumers provide them or they're type-only
  external: [
    'rxjs',
    'electron-ipc-cat',
    'electron-ipc-cat/common',
    'electron',
    'typeorm',
    'tiddlywiki',
    'ai',
    'git-sync-js',
    'type-fest',
    'zod',
    'zod/v4',
  ],
});
