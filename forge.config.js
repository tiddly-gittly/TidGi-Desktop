/* eslint-disable @typescript-eslint/restrict-template-expressions */
const packageJson = require('./package.json');

const { version, description } = packageJson;

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
          setupExe: `Install-TidGi-Windows-${arch}.exe`,
          setupIcon: 'build-resources/icon-installer.ico',
        };
      },
    },
    {
      name: '@electron-forge/maker-wix',
      config: (arch) => {
        return {
          language: 1033,
          manufacturer: 'tiddlywiki.org',
          programFilesFolderName: 'TiddlyWiki',
          shortcutFolderName: 'TiddlyWiki',
          description,
          exe: 'TidGi',
          name: 'TidGi',
          ui: {
            chooseDirectory: true,
          },
          appIconPath: 'build-resources/icon.ico',
          // WiX distributables do not handle prerelease information in the app version, removing it from the MSI (-prerelease3.4)
          // and https://github.com/felixrieseberg/electron-wix-msi/issues/110 ask use to use fixed number
          version: '1.0.0',
        };
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      platforms: ['linux'],
      config: {
        maintainer: 'Lin Onetwo <linonetwo012@gmail.com>',
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      platforms: ['linux'],
      config: {
        maintainer: 'Lin Onetwo <linonetwo012@gmail.com>',
      },
    },
    {
      name: '@reforged/maker-appimage',
      platforms: ['linux'],
      config: {
        options: {
          maintainer: 'Lin Onetwo <linonetwo012@gmail.com>',
          homepage: 'https://github.com/tiddly-gittly/TidGi-Desktop',
          icon: 'build-resources/icon.ico',
        },
      },
    },
    /**
     * ✖ Making for target: flatpak - On platform: linux - For arch: x64

        An unhandled error has occurred inside Forge:
        An error occured while making for target: flatpak
        flatpak failed with status code 1
        Error: flatpak failed with status code 1
            at ChildProcess.<anonymous> (/home/runner/work/TidGi-Desktop/TidGi-Desktop/node_modules/@malept/flatpak-bundler/index.js:71:16)
            at ChildProcess.emit (events.js:400:28)
            at ChildProcess.emit (domain.js:475:12)
            at maybeClose (internal/child_process.js:1058:16)
            at Process.ChildProcess._handle.onexit (internal/child_process.js:293:5)
     */
    // {
    //   name: '@electron-forge/maker-flatpak',
    // },
    /**
     * ✖ Making for target: snap - On platform: linux - For arch: x64

        An unhandled error has occurred inside Forge:
        An error occured while making for target: snap
        Command failed with a non-zero return code (2):
        /snap/bin/snapcraft snap --target-arch=amd64 --output=/home/runner/work/TidGi-Desktop/TidGi-Desktop/out/make/snap/x64/tidgi_0.7.6-prerelease3.4_amd64.snap
        Error: Command failed with a non-zero return code (2):
        /snap/bin/snapcraft snap --target-arch=amd64 --output=/home/runner/work/TidGi-Desktop/TidGi-Desktop/out/make/snap/x64/tidgi_0.7.6-prerelease3.4_amd64.snap
     */
    // {
    //   name: '@electron-forge/maker-snap',
    //   config: {
    //     features: {
    //       audio: true,
    //       mpris: 'org.tiddlywiki.tidgi',
    //       webgl: true,
    //     },
    //     summary: 'Personal knowledge-base note app with git and REST API.',
    //   },
    // },
  ],
  plugins: [
    { name: '@electron-forge/plugin-auto-unpack-natives', config: {} },
    {
      name: '@electron-forge/plugin-webpack',
      config: {
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
    },
  ],
};

module.exports = config;
