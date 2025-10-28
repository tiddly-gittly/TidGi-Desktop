/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable unicorn/prevent-abbreviations */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import esbuild from 'esbuild';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { rimraf } from 'rimraf';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * esbuild plugin to handle native .node files and their parent packages
 * Rewrites require() calls for .node files to use absolute paths from node_modules
 */
const nativeNodeModulesPlugin = {
  name: 'native-node-modules',
  setup(build) {
    // Rewrite nsfw's require() to use node_modules path
    build.onLoad({ filter: /nsfw[/\\]js[/\\]src[/\\]index\.js$/ }, async (args) => {
      let contents = await fs.readFile(args.path, 'utf8');
      
      // Replace relative path with require from node_modules
      // Original: require('../../build/Release/nsfw.node')
      // New: require('nsfw/build/Release/nsfw.node')
      contents = contents.replace(
        /require\(['"]\.\.\/\.\.\/build\/Release\/nsfw\.node['"]\)/g,
        "require('nsfw/build/Release/nsfw.node')"
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
      'ipc-syncadaptor.ts',
      'electron-ipc-cat.ts',
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
      'watch-filesystem-adaptor.ts',
    ],
  },
];

/**
 * Shared esbuild configuration
 */
const tsconfigPath = path.join(__dirname, '../tsconfig.json');
const ESBUILD_CONFIG = {
  logLevel: 'info',
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
const filterNonTsFiles = (src) => !src.endsWith('.ts');

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
          entryPoints: [path.join(sourcePath, entryPoint)],
          outdir: outDir,
        })
      )
    )
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
