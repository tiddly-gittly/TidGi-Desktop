import { workerPlugin } from '@fetsorn/vite-node-worker';
import fs from 'fs-extra';
import path from 'path';
import swc from 'unplugin-swc';
import { defineConfig, type Plugin } from 'vite';
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

/**
 * Vite plugin for `?utilityProcess` imports.
 *
 * Similar to `@fetsorn/vite-node-worker`'s `?nodeWorker`, but emits a factory
 * that calls `utilityProcess.fork(path)` instead of `new Worker(new URL(path))`.
 * UtilityProcess provides true process-level crash isolation.
 *
 * The generated code uses `require('path').resolve(__dirname, ...)` directly
 * (instead of `new URL(..., import.meta.url)`) to avoid the CJS
 * `import.meta.url` → `{}.url` breakage that the `fix-vite-node-worker-url`
 * plugin works around for worker_threads.
 */
function utilityProcessPlugin(): Plugin {
  const queryRE = /[?#].*$/s;
  const cleanUrl = (url: string) => url.replace(queryRE, '');
  const assetReferenceRE = /__VITE_UTILITY_PROCESS_ASSET__([\w$]+)__/g;

  const parseRequest = (id: string): Record<string, string> | null => {
    const search = id.match(/\?(.*)$/s)?.[1];
    if (!search) return null;
    return Object.fromEntries(new URLSearchParams(search));
  };

  return {
    name: 'vite:utility-process',
    apply: 'build',
    enforce: 'pre',
    resolveId(id, importer) {
      const query = parseRequest(id);
      if (query && query.utilityProcess !== undefined && importer) {
        return `${id}&importer=${importer}`;
      }
    },
    load(id) {
      const query = parseRequest(id);
      if (!query || query.utilityProcess === undefined || !query.importer) return;

      const cleanPath = cleanUrl(id);
      const hash = this.emitFile({
        type: 'chunk',
        id: cleanPath,
        importer: query.importer,
      });
      const assetReferenceId = `__VITE_UTILITY_PROCESS_ASSET__${hash}__`;

      return `
        import { utilityProcess } from 'electron';
        const workerPath = require('path').resolve(__dirname, ${assetReferenceId});
        export default function forkUtilityProcess(options) {
          return utilityProcess.fork(workerPath, [], options);
        }`;
    },
    renderChunk(code, chunk) {
      if (!assetReferenceRE.test(code)) return null;
      assetReferenceRE.lastIndex = 0;
      let match: RegExpExecArray | null;
      let result = code;
      while ((match = assetReferenceRE.exec(code))) {
        const [full, hash] = match;
        const filename = this.getFileName(hash);
        const relativePath = path.posix.relative(path.dirname(chunk.fileName), filename);
        result = result.replace(full, JSON.stringify(relativePath));
      }
      return { code: result, map: null };
    },
  };
}

export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  },
  plugins: [
    ...(process.env.ANALYZE === 'true'
      ? [analyzer({ analyzerMode: 'static', openAnalyzer: false, fileName: 'bundle-analyzer-main' })]
      : []),
    workerPlugin(),
    utilityProcessPlugin(),
    // Rolldown replaces import.meta.url with {}.url in CJS output, breaking
    // node Worker(new URL(...)) calls from vite-node-worker plugin.
    // Replace with __dirname-based path (CJS has __dirname natively).
    // Only needed for ?nodeWorker (Wiki Worker); ?utilityProcess uses
    // require('path').resolve(__dirname, ...) directly.
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
        'rotating-file-stream',
        ...typeormOptionalDepsRegex,
        'expo-sqlite',
      ],
    },
  },
});
