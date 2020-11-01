/* eslint-disable no-console */
const builder = require('electron-builder');
const { notarize } = require('electron-notarize');
const semver = require('semver');
const { exec } = require('child_process');

const packageJson = require('./package.json');

const { Arch, Platform } = builder;

// sometimes, notarization works but *.app does not have a ticket stapled to it
// this ensure the *.app has the notarization ticket
const verifyNotarizationAsync = filePath =>
  new Promise((resolve, reject) => {
    // eslint-disable-next-line no-console
    console.log(`xcrun stapler validate ${filePath.replace(/ /g, '\\ ')}`);

    exec(`xcrun stapler validate ${filePath.replace(/ /g, '\\ ')}`, (e, stdout, stderr) => {
      if (e instanceof Error) {
        reject(e);
        return;
      }

      if (stderr) {
        reject(new Error(stderr));
        return;
      }

      if (stdout.includes('The validate action worked!')) {
        resolve(stdout);
      } else {
        reject(new Error(stdout));
      }
    });
  });

console.log(`Machine: ${process.platform}`);

let targets;
switch (process.platform) {
  case 'darwin': {
    targets = Platform.MAC.createTarget();
    break;
  }
  case 'win32': {
    targets = Platform.WINDOWS.createTarget(['nsis'], Arch.x64);
    break;
  }
  default:
  case 'linux': {
    targets = Platform.LINUX.createTarget(['AppImage', 'snap'], Arch.x64);
    break;
  }
}

/**
 * exclude file from asar and unpack them
 * Should also exclude them https://github.com/electron-userland/electron-builder/issues/2290
 */
// const excludedFiles = [
//   // add dependencies of tiddlywiki here
//   // https://github.com/electron/electron/issues/18540#issuecomment-660679649
//   // tiddlywiki in the worker_thread
//   '**/node_modules/@tiddlygit/tiddlywiki/**/*',
//   // dep of dugite, asar unpack it so we can solve https://github.com/desktop/dugite/issues/414
//   '**/node_modules/dugite/**/*',
//   '**/node_modules/rimraf/**/*',
//   '**/node_modules/progress/**/*',
//   '**/node_modules/mkdirp/**/*',
//   '**/node_modules/minimist/**/*',
//   '**/node_modules/glob/**/*',
//   '**/node_modules/checksum/**/*',
//   '**/node_modules/got/**/*',
//   '**/node_modules/tar/**/*',
//   '**/node_modules/fs.realpath/**/*',
//   '**/node_modules/inflight/**/*',
//   '**/node_modules/path-is-absolute/**/*',
//   '**/node_modules/optimist/**/*',
//   '**/node_modules/minimatch/**/*',
//   '**/node_modules/inherits/**/*',
//   '**/node_modules/@sindresorhus/is/**/*',
//   '**/node_modules/@szmarczak/http-timer/**/*',
//   '**/node_modules/decompress-response/**/*',
//   '**/node_modules/duplexer3/**/*',
//   '**/node_modules/cacheable-request/**/*',
//   '**/node_modules/get-stream/**/*',
//   '**/node_modules/lowercase-keys/**/*',
//   '**/node_modules/mimic-response/**/*',
//   '**/node_modules/p-cancelable/**/*',
//   '**/node_modules/to-readable-stream/**/*',
//   '**/node_modules/url-parse-lax/**/*',
//   '**/node_modules/fs-minipass/**/*',
//   '**/node_modules/chownr/**/*',
//   '**/node_modules/safe-buffer/**/*',
//   '**/node_modules/once/**/*',
//   '**/node_modules/minizlib/**/*',
//   '**/node_modules/wrappy/**/*',
//   '**/node_modules/wordwrap/**/*',
//   '**/node_modules/defer-to-connect/**/*',
//   '**/node_modules/minipass/**/*',
//   '**/node_modules/clone-response/**/*',
//   '**/node_modules/get-stream/**/*',
//   '**/node_modules/http-cache-semantics/**/*',
//   '**/node_modules/keyv/**/*',
//   '**/node_modules/lowercase-keys/**/*',
//   '**/node_modules/brace-expansion/**/*',
//   '**/node_modules/responselike/**/*',
//   '**/node_modules/pump/**/*',
//   '**/node_modules/normalize-url/**/*',
//   '**/node_modules/yallist/**/*',
//   '**/node_modules/json-buffer/**/*',
//   '**/node_modules/balanced-match/**/*',
//   '**/node_modules/concat-map/**/*',
//   '**/node_modules/prepend-http/**/*',
//   '**/node_modules/end-of-stream/**/*',
//   // deps of electron-settings
//   '**/node_modules/electron-settings/**/*',
//   '**/node_modules/lodash.get/**/*',
//   '**/node_modules/lodash.set/**/*',
//   '**/node_modules/write-file-atomic/**/*',
//   '**/node_modules/lodash.has/**/*',
//   '**/node_modules/lodash.unset/**/*',
//   '**/node_modules/is-typedarray/**/*',
//   '**/node_modules/signal-exit/**/*',
//   '**/node_modules/imurmurhash/**/*',
//   '**/node_modules/typedarray-to-buffer/**/*',
// ];

const options = {
  targets,
  config: {
    appId: 'com.tiddlygit.app',
    productName: 'TiddlyGit',
    asar: false,
    extraFiles: [
      {
        from: 'template/wiki',
        to: 'wiki',
        filter: ['**/*'],
      },
      {
        from: 'localization',
        to: 'localization',
        filter: ['**/*'],
      },
    ],
    // asarUnpack: excludedFiles,
    files: [
      '!tests/**/*',
      '!docs/**/*',
      '!template/**/*',
      '!flow-typed/**/*',
      '!localization/**/*',
      // ...excludedFiles.map(pathName => `!${pathName.replace('**/', '')}`),
    ],
    extraResources: [
      {
        from: 'public/libs/wiki/wiki-worker.js',
        to: 'app.asar.unpacked/wiki-worker.js',
      },
      // ...excludedFiles.map(pathName => ({
      //   from: pathName.replace('**/', '').replace('/**/*', ''),
      //   to: `app.asar.unpacked/${pathName.replace('**/', '').replace('/**/*', '')}`,
      //   filter: ['**/*'],
      // }))
    ],
    protocols: [
      {
        name: 'HTTPS Protocol',
        schemes: ['https'],
      },
      {
        name: 'HTTP Protocol',
        schemes: ['http'],
      },
      {
        name: 'Mailto Protocol',
        schemes: ['mailto'],
      },
    ],
    directories: {
      buildResources: 'build-resources',
    },
    mac: {
      category: 'public.app-category.productivity',
      hardenedRuntime: true,
      gatekeeperAssess: false,
      entitlements: 'build-resources/entitlements.mac.plist',
      entitlementsInherit: 'build-resources/entitlements.mac.plist',
      darkModeSupport: true,
    },
    linux: {
      category: 'Utility',
      packageCategory: 'utils',
    },
    snap: {
      publish: [
        {
          provider: 'snapStore',
          channels: [semver.prerelease(packageJson.version) ? 'edge' : 'stable'],
        },
        'github',
      ],
    },
    afterSign: context => {
      return null;
      const shouldNotarize =
        process.platform === 'darwin' && context.electronPlatformName === 'darwin' && process.env.CI_BUILD_TAG;
      if (!shouldNotarize) return null;

      console.log('Notarizing app...');
      // https://kilianvalkhof.com/2019/electron/notarizing-your-electron-application/
      const { appOutDir } = context;

      const appName = context.packager.appInfo.productFilename;
      const appPath = `${appOutDir}/${appName}.app`;

      return notarize({
        appBundleId: 'com.tiddlygit.app',
        appPath,
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_ID_PASSWORD,
      })
        .then(() => verifyNotarizationAsync(appPath))
        .then(notarizedInfo => {
          // eslint-disable-next-line no-console
          console.log(notarizedInfo);
        });
    },
  },
};

builder
  .build(options)
  .then(() => {
    console.log('build successful');
  })
  .catch(error => {
    console.log(error);
    process.exit(1);
  });
