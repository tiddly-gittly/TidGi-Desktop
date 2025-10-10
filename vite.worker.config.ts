import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';

// Configuration for building worker files
// Workers will be built as separate entry points
export default defineConfig({
  build: {
    // Output to a specific directory for workers
    outDir: '.vite/workers',
    lib: {
      entry: {
        gitWorker: 'src/services/git/gitWorker.ts',
        wikiWorker: 'src/services/wiki/wikiWorker/index.ts',
      },
      formats: ['cjs'],
    },
    rollupOptions: {
      external: [
        ...builtinModules,
        ...builtinModules.map(m => `node:${m}`),
        'threads/worker',
        'git-sync-js',
        'tiddlywiki',
      ],
    },
    // Don't minify workers for easier debugging
    minify: false,
  },
});
