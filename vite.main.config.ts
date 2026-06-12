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
      // TypeORM's ExpoDriver.js has a try-catch require('expo-sqlite'). The
      // forge Vite subprocess loses rolldownOptions.external during config
      // merging, so we redirect to an empty stub that's never used at runtime.
      'expo-sqlite': path.resolve(__dirname, './src/__tests__/__stubs__/expoSqliteStub.js'),
    },
  },
  build: {
    commonjsOptions: {
      ignoreDynamicRequires: true,
    },
    // `ssr.external` is forwarded directly to Rolldown in the forge subprocess
    // and bypasses config merge issues that strip rolldownOptions.external.
    ssr: {
      external: ['expo-sqlite'],
    },
    rolldownOptions: {
      external: [
        'sqlite-vec',
        'registry-js',
        'dugite',
        'tiddlywiki',
        'zx',
        'esbuild',
        '@modelcontextprotocol/sdk',
        /^@modelcontextprotocol\/sdk\//,
        'default-gateway',
        'electron-unhandled',
        'rotating-file-stream',
        // TypeORM's ExpoDriver.js has a try-catch require('expo-sqlite') that
        // Rolldown tries to resolve. It's safe to externalize — this driver is
        // never loaded in Electron.
        'expo-sqlite',
        ...typeormOptionalDepsRegex,
      ],
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
        'default-gateway',
        'electron-unhandled',
        'rotating-file-stream',
        // TypeORM's ExpoDriver.js has a try-catch require('expo-sqlite') that
        // Rolldown tries to resolve. It's safe to externalize — this driver is
        // never loaded in Electron.
        'expo-sqlite',
        ...typeormOptionalDepsRegex,
      ],
    },
  },
});
