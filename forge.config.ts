import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { VitePlugin } from '@electron-forge/plugin-vite';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { readJsonSync } from 'fs-extra';
import path from 'path';
import afterPack from './scripts/afterPack';
import beforeAsar from './scripts/beforeAsar';

const packageJson = readJsonSync(path.join(__dirname, 'package.json')) as { description: string };
const supportedLanguages = readJsonSync(path.join(__dirname, 'localization', 'supportedLanguages.json')) as Record<string, string>;

const { description } = packageJson;
// Get list of supported language codes from centralized config
const supportedLanguageCodes = Object.keys(supportedLanguages);

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
    extraResource: ['localization', 'template/wiki', 'build-resources/tidgiMiniWindow@2x.png', 'build-resources/tidgiMiniWindowTemplate@2x.png'],
    // @ts-expect-error - mac config is valid
    mac: {
      category: 'productivity',
      target: 'dmg',
      icon: 'build-resources/icon.icns',
      electronLanguages: supportedLanguageCodes,
    },
    appBundleId: 'com.tidgi',
    afterPrune: [afterPack],
    beforeAsar: [beforeAsar],
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
