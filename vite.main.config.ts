import fs from 'fs-extra';
import path from 'path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vite';
import { analyzer } from 'vite-bundle-analyzer';
import { utilityProcessPlugin } from 'vite-plugin-electron-utility-process';

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
    utilityProcessPlugin(),
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2021',
      },
    }),
  ],
  resolve: {
    // Force Node.js resolution for TypeORM — Rolldown picks the "browser"
    // export condition by default which includes ExpoDriver + expo-sqlite.
    conditions: ['node'],
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
        'expo-sqlite',
        ...typeormOptionalDepsRegex,
      ],
    },
  },
});
