/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable unicorn/prevent-abbreviations */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import esbuild from 'esbuild';

const outDir = path.join(__dirname, '../plugins-dev/linonetwo/tidgi');
await fs.mkdirp(outDir);
const tsconfigPath = path.join(__dirname, '../tsconfig.json');
const sourceFolder = '../src/services/wiki/plugin/ipcSyncAdaptor';
const sharedConfig = {
  logLevel: 'info',
  bundle: true,
  // use node so we have `exports`, otherwise `module.adaptorClass` in $:/core/modules/startup.js will be undefined
  platform: 'node',
  minify: true,
  outdir: outDir,
  tsconfig: tsconfigPath,
  target: 'ESNEXT',
};
await Promise.all([
  esbuild.build({
    ...sharedConfig,
    entryPoints: [path.join(__dirname, sourceFolder, 'ipc-syncadaptor.ts')],
  }),
  esbuild.build({
    ...sharedConfig,
    entryPoints: [path.join(__dirname, sourceFolder, 'Startup/electron-ipc-cat.ts')],
  }),
]);
const filterFunc = (src) => {
  return !src.endsWith('.ts');
};
await fs.copy(path.join(__dirname, sourceFolder), outDir, { filter: filterFunc });
