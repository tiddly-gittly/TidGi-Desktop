import type { ForgeConfig } from '@electron-forge/shared-types';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import packageJson = require('./package.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import beforeAsar = require('./scripts/beforeAsar');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import afterPack = require('./scripts/afterPack');

const { description } = packageJson;

const config: ForgeConfig = {
  packagerConfig: {
    name: 'TidGi',
    executableName: 'tidgi',
    win32metadata: {
      CompanyName: 'TiddlyWiki Community',
      OriginalFilename: 'TidGi Desktop',
    },
    protocols: [
      {
        name: 'TidGi Launch Protocol',
        schemes: ['tidgi'],
      },
    ],
    icon: 'build-resources/icon.ico',
    asar: {
      // Unpack worker files, native modules path, and ALL .node binaries (including better-sqlite3)
      unpack: '{**/.webpack/main/*.worker.*,**/.webpack/main/native_modules/path.txt,**/{.**,**}/**/*.node}',
    },
    extraResource: ['localization', 'template/wiki', 'build-resources/menubar@2x.png', 'build-resources/menubarTemplate@2x.png'],
    // @ts-expect-error - mac config is valid
    mac: {
      category: 'productivity',
      target: 'dmg',
      icon: 'build-resources/icon.icns',
      electronLanguages: ['zh_CN', 'en', 'ja'],
    },
    appBundleId: 'com.tidgi',
    afterPrune: [afterPack.default],
    beforeAsar: [beforeAsar.default],
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: (arch: string) => {
        return {
          setupExe: `Install-TidGi-Windows-${arch}.exe`,
          setupIcon: 'build-resources/icon-installer.ico',
          description,
          iconUrl: 'https://raw.githubusercontent.com/tiddly-gittly/TidGi-Desktop/master/build-resources/icon%405x.png',
        };
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
      config: {},
    },
    {
      name: '@electron-forge/maker-deb',
      platforms: ['linux'],
      config: {
        options: {
          maintainer: 'Lin Onetwo <linonetwo012@gmail.com>',
          mimeType: ['x-scheme-handler/tidgi'],
        },
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      platforms: ['linux'],
      config: {
        options: {
          maintainer: 'Lin Onetwo <linonetwo012@gmail.com>',
          mimeType: ['x-scheme-handler/tidgi'],
        },
      },
    },
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      build: [
        {
          // `entry` is an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/index.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
};

export default config;
