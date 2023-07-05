/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable unicorn/prevent-abbreviations */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import esbuild from 'esbuild';

// put it here, so it can be loaded via `'+plugins/linonetwo/tidgi'` in cli, and get copied in scripts/afterPack.js when copying tiddlywiki (no need to copy this plugin again)
const tidgiIpcSyncadaptorOutDir = path.join(__dirname, '../node_modules/@tiddlygit/tiddlywiki/plugins/linonetwo/tidgi-ipc-syncadaptor');
await fs.mkdirp(tidgiIpcSyncadaptorOutDir);
const tsconfigPath = path.join(__dirname, '../tsconfig.json');
const tidgiIpcSyncadaptorSourceFolder = '../src/services/wiki/plugin/ipcSyncAdaptor';
const sharedConfig = {
  logLevel: 'info',
  bundle: true,
  // use node so we have `exports`, otherwise `module.adaptorClass` in $:/core/modules/startup.js will be undefined
  platform: 'node',
  minify: process.env.NODE_ENV === 'production',
  outdir: tidgiIpcSyncadaptorOutDir,
  tsconfig: tsconfigPath,
  target: 'ESNEXT',
};
await Promise.all([
  esbuild.build({
    ...sharedConfig,
    entryPoints: [path.join(__dirname, tidgiIpcSyncadaptorSourceFolder, 'ipc-syncadaptor.ts')],
  }),
  esbuild.build({
    ...sharedConfig,
    entryPoints: [path.join(__dirname, tidgiIpcSyncadaptorSourceFolder, 'electron-ipc-cat.ts')],
  }),
  esbuild.build({
    ...sharedConfig,
    entryPoints: [path.join(__dirname, tidgiIpcSyncadaptorSourceFolder, 'fix-location-info.ts')],
  }),
]);
const filterFunc = (src) => {
  return !src.endsWith('.ts');
};
await fs.copy(path.join(__dirname, tidgiIpcSyncadaptorSourceFolder), tidgiIpcSyncadaptorOutDir, { filter: filterFunc });

const tidgiIpcSyncadaptorUISourceFolder = '../src/services/wiki/plugin/ipcSyncAdaptorUI';
const tidgiIpcSyncadaptorUIOutDir = path.join(__dirname, '../node_modules/@tiddlygit/tiddlywiki/plugins/linonetwo/tidgi-ipc-syncadaptor-ui');
await fs.copy(path.join(__dirname, tidgiIpcSyncadaptorUISourceFolder), tidgiIpcSyncadaptorUIOutDir, { filter: filterFunc });
