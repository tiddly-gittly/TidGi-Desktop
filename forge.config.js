/* eslint-disable @typescript-eslint/restrict-template-expressions */
module.exports = {
  packagerConfig: {
    name: 'TiddlyGit',
    executableName: 'TiddlyGit',
    icon: 'build-resources/icon.icns',
    asar: {
      unpack: '**/.webpack/main/*.worker.*',
    },
    extraResource: ['.webpack/node_modules', 'localization', 'template/wiki', 'build-resources/menubar@2x.png', 'build-resources/menubarTemplate@2x.png'],
    mac: {
      category: 'productivity',
      target: 'dmg',
      icon: 'build-resources/icon.icns',
      electronLanguages: ['zh_CN', 'en', 'ja'],
    },
    afterPrune: ['scripts/afterPack.js'],
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: (arch) => {
        return {
          setupExe: `TiddlyGit-${arch}-setup.exe`,
          setupIcon: 'build-resources/icon.ico',
        };
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
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
