/* eslint-disable @typescript-eslint/use-unknown-in-catch-callback-variable */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import esbuild from 'esbuild';
import fs from 'fs-extra';
import path from 'path';
import { rimraf } from 'rimraf';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * esbuild plugin to handle native .node files and their parent packages
 * Rewrites require() calls for .node files to use an absolute path supplied by
 * the main process.
 */
const nativeNodeModulesPlugin = {
  name: 'native-node-modules',
  setup(build) {
    // Rewrite nsfw's require() to use the main-process binary path
    build.onLoad({ filter: /nsfw[/\\]js[/\\]src[/\\]index\.js$/ }, async (args) => {
      let contents = await fs.readFile(args.path, 'utf8');

      // The wiki worker may boot a wiki-local TiddlyWiki installation.  A bare
      // `require('nsfw/...')` from the bundled plugin then resolves against that
      // installation instead of TidGi's packaged dependency tree.  Resolve the
      // native module from the absolute path supplied by the main process.
      contents = contents.replace(
        /require\(\s*['"]\.\.\/\.\.\/build\/Release\/nsfw\.node['"]\s*\)/g,
        `(() => {
          const binaryPath = process.env['TIDGI_NSFW_BINARY_PATH'];
          if (!binaryPath || !path.isAbsolute(binaryPath)) {
            throw new Error('TIDGI_NSFW_BINARY_PATH must be an absolute path to nsfw.node');
          }
          return require(binaryPath);
        })()`,
      );

      return {
        contents,
        loader: 'js',
      };
    });

    // Mark the .node file itself as external
    build.onResolve({ filter: /nsfw[/\\]build[/\\]Release[/\\]nsfw\.node$/ }, () => ({
      external: true,
    }));
    // External '$:/' files
    build.onResolve({ filter: /^\$:\// }, () => ({
      external: true,
    }));
    // External typeorm optional drivers that are irrelevant in Electron context
    build.onResolve({ filter: /^(expo-sqlite|react-native-sqlite-storage|sql\.js|oracledb|mongodb|redis|ioredis)$/ }, () => ({
      external: true,
    }));
  },
};

/**
 * tw-react's npm package contains its compiled widget implementation but not
 * the plugin metadata or browser-side React modules from its release bundle.
 * Bundle that implementation into our browser plugin so it shares the exact
 * React instance used by @memeloop/react-ui and has no unresolved bare-module
 * dependency inside TiddlyWiki.
 */
const bundledTwReactWidgetPlugin = {
  name: 'bundled-tw-react-widget',
  setup(build) {
    build.onResolve({ filter: /^\$:\/plugins\/linonetwo\/tw-react\/widget\.js$/ }, () => ({
      path: path.join(__dirname, '../node_modules/tw-react/dist/plugins/linonetwo/tw-react/widget.js'),
    }));
  },
};

/**
 * tw-react 0.6.4 still imports `react-dom` and calls `createRoot` on it. React
 * 19 exposes that API only from `react-dom/client`, so keep the compatibility
 * seam local to the bundled third-party widget instead of patching React or
 * leaking a second React root implementation into the Wiki at runtime.
 */
const twReactReact19Plugin = {
  name: 'tw-react-react-19-client-entry',
  setup(build) {
    build.onResolve({ filter: /^react-dom$/ }, args => {
      const normalizedImporter = args.importer.replaceAll('\\', '/');
      if (!normalizedImporter.endsWith('/tw-react/dist/plugins/linonetwo/tw-react/widget.js')) return undefined;
      return { path: path.join(__dirname, '../node_modules/react-dom/client.js') };
    });
  },
};

/**
 * Configuration for all plugins to build
 */
const PLUGINS = [
  {
    name: 'tidgi-ipc-syncadaptor',
    sourceFolder: '../src/services/wiki/plugin/ipcSyncAdaptor',
    entryPoints: [
      'Startup/electron-ipc-cat.ts',
      'Startup/mount-tidgi-service.ts',
      'ipc-syncadaptor.ts',
      'fix-location-info.ts',
    ],
  },
  {
    name: 'tidgi-ipc-syncadaptor-ui',
    sourceFolder: '../src/services/wiki/plugin/ipcSyncAdaptorUI',
    entryPoints: [], // No TypeScript entry points, just copy files
  },
  {
    name: 'watch-filesystem-adaptor',
    sourceFolder: '../src/services/wiki/plugin/watchFileSystemAdaptor',
    entryPoints: [
      'loader.ts',
      'in-tagtree-of.ts',
      'WatchFileSystemAdaptor.ts',
      'routingUtilities.ts',
    ],
  },
  {
    name: 'memeloop-agent-ui',
    sourceFolder: '../src/services/wiki/plugin/memeloopAgentUI',
    entryPoints: ['components.tsx', 'widget.ts'],
    buildOptions: {
      platform: 'browser',
      format: 'cjs',
      plugins: [bundledTwReactWidgetPlugin, twReactReact19Plugin, nativeNodeModulesPlugin],
    },
  },
];

/**
 * Shared esbuild configuration
 */
const tsconfigPath = path.join(__dirname, '../tsconfig.json');
const ESBUILD_CONFIG = {
  logLevel: 'info',
  logOverride: {
    // Locale resources are bundled as JSON. Duplicate keys silently shadow
    // earlier translations at runtime, so treat them as a build failure.
    'duplicate-object-key': 'error',
  },
  bundle: true,
  platform: 'node', // Use node so we have `exports`, otherwise `module.adaptorClass` will be undefined
  minify: process.env.NODE_ENV === 'production',
  tsconfig: tsconfigPath,
  target: 'ESNEXT',
  plugins: [nativeNodeModulesPlugin],
};

/**
 * Filter function to exclude TypeScript files when copying
 */
const filterNonTsFiles = (src) => !/\.tsx?$/.test(src);

/**
 * Get all possible output directories for a plugin
 * Returns both development node_modules and packaged app directories
 */
function getPluginOutputDirs(pluginName) {
  const devOutDir = path.join(__dirname, '../node_modules/tiddlywiki/plugins/linonetwo', pluginName);
  const outDirs = [devOutDir];

  // Check for packaged app directories (created by afterPack.ts)
  const outDir = path.join(__dirname, '../out');
  if (fs.existsSync(outDir)) {
    // Find all packaged app directories
    const packDirs = fs.readdirSync(outDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => {
        // In packaged electron app, node_modules is in resources/
        const resourcesPath = path.join(outDir, dirent.name, 'resources/node_modules/tiddlywiki/plugins/linonetwo', pluginName);
        return resourcesPath;
      });

    // Only add directories that exist (have been created by afterPack)
    packDirs.forEach(dir => {
      const parentDir = path.dirname(dir);
      if (fs.existsSync(parentDir)) {
        outDirs.push(dir);
      }
    });
  }

  return outDirs;
}

/**
 * Prepare output directories for a plugin
 */
async function prepareOutputDirs(outDirs) {
  await Promise.all(outDirs.map(async (outDir) => {
    await rimraf(outDir);
    await fs.mkdirp(outDir);
  }));
}

/**
 * Build TypeScript entry points to all output directories
 */
async function buildEntryPoints(plugin, outDirs) {
  if (!plugin.entryPoints || plugin.entryPoints.length === 0) {
    return;
  }

  const sourcePath = path.join(__dirname, plugin.sourceFolder);

  await Promise.all(
    outDirs.flatMap(outDir =>
      plugin.entryPoints.map(entryPoint =>
        esbuild.build({
          ...ESBUILD_CONFIG,
          ...plugin.buildOptions,
          entryPoints: [path.join(sourcePath, entryPoint)],
          outdir: outDir,
          // Preserve subdirectory structure (e.g., Startup/) in output
          outbase: sourcePath,
        })
      )
    ),
  );
}

/**
 * Copy non-TypeScript files to all output directories
 */
async function copyNonTsFiles(plugin, outDirs) {
  const sourcePath = path.join(__dirname, plugin.sourceFolder);

  await Promise.all(outDirs.map(async (outDir) => {
    await fs.copy(sourcePath, outDir, { filter: filterNonTsFiles });
    console.log(`✓ Copied ${plugin.name} to: ${outDir}`);
  }));
}

/**
 * Build a single plugin to all output directories
 */
async function buildPlugin(plugin) {
  console.log(`\nBuilding plugin: ${plugin.name}`);

  const outDirs = getPluginOutputDirs(plugin.name);
  console.log(`  Output directories: ${outDirs.length}`);

  // Prepare output directories
  await prepareOutputDirs(outDirs);

  // Build TypeScript entry points
  await buildEntryPoints(plugin, outDirs);

  // Copy non-TypeScript files
  await copyNonTsFiles(plugin, outDirs);

  console.log(`✓ Completed ${plugin.name}`);
}

/**
 * Main function to build all plugins
 */
async function main() {
  console.log('Starting plugin compilation...\n');

  // Older builds copied an incomplete tw-react npm folder into TiddlyWiki's
  // plugin path. It is now bundled into memeloop-agent-ui and must not remain
  // as a discoverable-but-unloadable sibling plugin.
  await Promise.all(getPluginOutputDirs('tw-react').map(async outputDirectory => await rimraf(outputDirectory)));

  for (const plugin of PLUGINS) {
    await buildPlugin(plugin);
  }

  console.log('\n✓ All plugins compiled successfully!');
}

// Run main function
main().catch((error) => {
  console.error('Error compiling plugins:', error);
  process.exit(1);
});
