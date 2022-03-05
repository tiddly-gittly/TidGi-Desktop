/* eslint-disable @typescript-eslint/restrict-template-expressions */
const packageJson = require('./package.json');

const { version } = packageJson;

const config = {
  packagerConfig: {
    name: 'TidGi',
    executableName: 'TidGi',
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
    icon: 'build-resources/icon.icns',
    asar: {
      unpack: '**/.webpack/main/*.worker.*',
    },
    extraResource: ['localization', 'template/wiki', 'build-resources/menubar@2x.png', 'build-resources/menubarTemplate@2x.png'],
    mac: {
      category: 'productivity',
      target: 'dmg',
      icon: 'build-resources/icon.icns',
      electronLanguages: ['zh_CN', 'en', 'ja'],
    },
    appBundleId: 'com.tidgi',
    afterPrune: ['scripts/afterPack.js'],
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: (arch) => {
        return {
          setupExe: `Install-TidGi-${version}-Windows-${arch}.exe`,
          setupIcon: 'build-resources/icon-installer.ico',
        };
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        maintainer: 'Lin Onetwo <linonetwo012@gmail.com>',
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        maintainer: 'Lin Onetwo <linonetwo012@gmail.com>',
      },
    },
    {
      name: 'electron-forge-maker-appimage',
      config: {
        maintainer: 'Lin Onetwo <linonetwo012@gmail.com>',
      },
    },
  ],
  plugins: [
    ['@electron-forge/plugin-auto-unpack-natives'],
    [
      '@electron-forge/plugin-webpack',
      {
        mainConfig: './webpack.main.config.js',
        renderer: {
          config: './webpack.renderer.config.js',
          entryPoints: [
            {
              html: './src/renderer.html',
              js: './src/renderer.tsx',
              preload: {
                js: './src/preload/index.ts',
              },
              name: 'main_window',
            },
          ],
        },
      },
    ],
  ],
};

module.exports = config;
