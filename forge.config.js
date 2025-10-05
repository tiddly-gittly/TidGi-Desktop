/* eslint-disable @typescript-eslint/restrict-template-expressions */
const packageJson = require('./package.json');
const beforeAsar = require('./scripts/beforeAsar').default;
const afterPack = require('./scripts/afterPack').default;

const { description } = packageJson;

const config = {
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
      unpack: '{**/.webpack/main/*.worker.*,**/.webpack/main/native_modules/path.txt}',
    },
    extraResource: ['localization', 'template/wiki', 'build-resources/menubar@2x.png', 'build-resources/menubarTemplate@2x.png'],
    mac: {
      category: 'productivity',
      target: 'dmg',
      icon: 'build-resources/icon.icns',
      electronLanguages: ['zh_CN', 'en', 'ja'],
    },
    appBundleId: 'com.tidgi',
    afterPrune: [afterPack],
    beforeAsar: [beforeAsar],
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: (arch) => {
        return {
          setupExe: `Install-TidGi-Windows-${arch}.exe`,
          setupIcon: 'build-resources/icon-installer.ico',
          description,
          iconUrl: 'https://raw.githubusercontent.com/tiddly-gittly/TidGi-Desktop/master/build-resources/icon%405x.png',
        };
      },
    },
    // Env WIN_CSC_LINK is not correct https://github.com/rabbit-hole-syndrome/electron-forge-maker-portable/issues/7
    // {
    //   name: '@rabbitholesyndrome/electron-forge-maker-portable',
    //   platforms: ['win32'],
    //   config: (arch) => {
    //     return {
    //       artifactName: `Portable-TidGi-Windows-${arch}.exe`,
    //     };
    //   },
    // },
    //  ✖ Preparing native dependencies: 0 / 1 [FAILED: node-gyp failed to rebuild '/Users/runner/work/TidGi-Desktop/TidGi-Desktop/node_modules/.pnpm/@bitdisaster+exe-icon-extractor@1.0.10/node_modules/@bitdisaster/exe-icon-extractor']
    // {
    //   name: '@electron-forge/maker-wix',
    //   config: (arch) => {
    //     return {
    //       language: 1033,
    //       manufacturer: 'tiddlywiki.org',
    //       programFilesFolderName: 'TiddlyWiki',
    //       shortcutFolderName: 'TiddlyWiki',
    //       description,
    //       exe: 'TidGi',
    //       name: 'TidGi',
    //       ui: {
    //         chooseDirectory: true,
    //       },
    //       appIconPath: 'build-resources/icon.ico',
    //       // WiX distributables do not handle prerelease information in the app version, removing it from the MSI (-prerelease3.4)
    //       // and https://github.com/felixrieseberg/electron-wix-msi/issues/110 ask use to use fixed number
    //       version: '1.0.0',
    //     };
    //   },
    // },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      platforms: ['linux'],
      executableName: 'tidgi',
      config: {
        maintainer: 'Lin Onetwo <linonetwo012@gmail.com>',
        mimeType: ['x-scheme-handler/tidgi'],
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      platforms: ['linux'],
      executableName: 'tidgi',
      config: {
        maintainer: 'Lin Onetwo <linonetwo012@gmail.com>',
        mimeType: ['x-scheme-handler/tidgi'],
      },
    },
    /**
     * [STARTED] Making a AppImage distributable for linux/x64
        [FAILED] An error occured while making for target: AppImage
        [FAILED] An error occured while making for target: AppImage

        An unhandled rejection has occurred inside Forge:
        [object Object]
     */
    /**
     * TypeError: maker.clone is not a function
at /home/runner/work/TidGi-Desktop/TidGi-Desktop/node_modules/.pnpm/@electron-forge+core@7.2.0/node_modules/@electron-forge/core/dist/api/make.js:120:45
     */
    // {
    //   name: '@reforged/maker-appimage',
    //   platforms: ['linux'],
    //   config: {
    //     options: {
    //       maintainer: 'Lin Onetwo <linonetwo012@gmail.com>',
    //       homepage: 'https://github.com/tiddly-gittly/TidGi-Desktop',
    //       icon: 'build-resources/icon.png',
    //     },
    //   },
    // },
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
      name: '@electron-forge/plugin-vite',
      config: {
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
      },
    },
  ],
};

module.exports = config;
