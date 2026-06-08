import { workerPlugin } from '@fetsorn/vite-node-worker';
import fs from 'fs-extra';
import path from 'path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vite';
import { analyzer } from 'vite-bundle-analyzer';

// Dynamically read TypeORM's optional peer dependencies to avoid hardcoding
const typeormPackageJson = fs.readJsonSync(path.resolve(__dirname, 'node_modules/typeorm/package.json')) as Record<string, unknown>;
const typeormOptionalDepNames = Object.keys(typeormPackageJson.peerDependenciesMeta || {}).filter(
  (dep) => dep !== 'better-sqlite3',
);

// Convert to RegExp to match both package name and sub-paths
const typeormOptionalDepsRegex = typeormOptionalDepNames.map(
  (dep) => new RegExp(`^${dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/.*)?$`),
);

export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  },
  plugins: [
    ...(process.env.ANALYZE === 'true'
      ? [analyzer({ analyzerMode: 'static', openAnalyzer: false, fileName: 'bundle-analyzer-main' })]
      : []),
    workerPlugin(),
    // Rolldown replaces import.meta.url with {}.url in CJS output, breaking
    // node Worker(new URL(...)) calls from vite-node-worker plugin.
    // Replace with __dirname-based path (CJS has __dirname natively).
    // TODO: switch to child_process for crash isolation, then remove this.
    {
      name: 'fix-vite-node-worker-url',
      enforce: 'post',
      generateBundle(_, bundle) {
        for (const chunk of Object.values(bundle)) {
          if (chunk.type === 'chunk') {
            chunk.code = chunk.code.replace(
              /new URL\(["'`](\.[^"'`]+)["'`],\s*\{}\.url\)/g,
              `require('path').resolve(__dirname, "$1")`,
            );
          }
        }
      },
    },
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2021',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@services': path.resolve(__dirname, './src/services'),
      'i18next-fs-backend': path.resolve(__dirname, './node_modules/i18next-fs-backend/cjs/index.js'),
      'i18next-electron-fs-backend': path.resolve(__dirname, './node_modules/i18next-electron-fs-backend/cjs/index.js'),
    },
  },
  build: {
    commonjsOptions: {
      ignoreDynamicRequires: true,
    },
    rollupOptions: {
      external: [
        'sqlite-vec',
        'registry-js',
        'dugite',
        'tiddlywiki',
        'zx',
        'esbuild',
        '@modelcontextprotocol/sdk',
        /^@modelcontextprotocol\/sdk\//,
        // default-gateway v7 / electron-unhandled v5 are pure ESM, used via dynamic import().
        // External so the dynamic import() runs at Node.js runtime.
        'default-gateway',
        'electron-unhandled',
        // rotating-file-stream@3 is pure ESM ("type":"module") but has a CJS dist.
        // External it so Node.js native require() uses its "exports.require" CJS entry.
        'rotating-file-stream', // moment is a CJS package whose default export is a function (moment()).
        // Rolldown wraps it as a namespace object. External so Node.js loads the native
        // CJS function export. afterPack.ts copies it to the packaged app.
        'moment',
        ...typeormOptionalDepsRegex,
        'expo-sqlite',
      ],
    },
  },
});
