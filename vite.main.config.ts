import { workerPlugin } from '@fetsorn/vite-node-worker';
import fs from 'fs-extra';
import path from 'path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vite';

// Dynamically read TypeORM's optional peer dependencies to avoid hardcoding
const typeormPackageJson = fs.readJsonSync(path.resolve(__dirname, 'node_modules/typeorm/package.json'));
const typeormOptionalDepNames = Object.keys(typeormPackageJson.peerDependenciesMeta || {}).filter(
  // Keep better-sqlite3 as we use it; external others
  (dep) => dep !== 'better-sqlite3',
);

// Convert to RegExp to match both package name and sub-paths (e.g., @sap/hana-client/extension/Stream)
// Escape special regex characters in package names (e.g., @, /, -)
const typeormOptionalDepsRegex = typeormOptionalDepNames.map(
  (dep) => new RegExp(`^${dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/.*)?$`),
);

// https://vitejs.dev/config
export default defineConfig({
  define: {
    // Preserve NODE_ENV at build time so it's available at runtime
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  },
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
      // Force use CommonJS version of i18next-fs-backend to avoid top-level await in ESM version
      'i18next-fs-backend': path.resolve(__dirname, './node_modules/i18next-fs-backend/cjs/index.js'),
      'i18next-electron-fs-backend': path.resolve(__dirname, './node_modules/i18next-electron-fs-backend/cjs/index.js'),
    },
  },
  build: {
    commonjsOptions: {
      // Don't transpile dynamic requires in better-sqlite3 (it dynamically loads .node files). "Ignore" means leave them as-is.
      // The .node files will be handled by `scripts/afterPack.js` and `SQLITE_BINARY_PATH` in `src/constants/paths.ts`
      ignoreDynamicRequires: true,
    },
    rollupOptions: {
      external: [
        // Native binary modules (keep JS code, but .node files will be handled by asar unpack)
        // Do NOT external better-sqlite3 - let Vite bundle its JS code, .node file will be unpacked
        'sqlite-vec',
        'registry-js',
        'dugite',

        // Large libraries with __filename/__dirname usage - must be external
        'tiddlywiki',

        // Build tools with binary - must be external
        'zx',
        'esbuild',

        // TypeORM's optional peer dependencies (dynamically read from package.json)
        // Use RegExp to match both package name and sub-paths (e.g., @sap/hana-client/extension/Stream)
        // We only use better-sqlite3, so external all others to avoid "module not found" errors
        ...typeormOptionalDepsRegex,
      ],
    },
  },
});
