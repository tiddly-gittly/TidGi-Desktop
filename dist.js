/* eslint-disable no-console */
const builder = require('electron-builder');
const { notarize } = require('electron-notarize');

const { Arch, Platform } = builder;

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

const opts = {
  targets,
  config: {
    appId: 'com.singlebox.app',
    productName: 'Singlebox',
    asar: true,
    files: [
      '!tests/**/*',
      '!docs/**/*',
      '!catalog/**/*',
      '!template/**/*',
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
          channels: ['edge'],
        },
        'github',
      ],
    },
    afterSign: (context) => {
      const shouldNotarize = process.platform === 'darwin' && context.electronPlatformName === 'darwin' && process.env.CI_BUILD_TAG;
      if (!shouldNotarize) return null;

      console.log('Notarizing app...');
      // https://kilianvalkhof.com/2019/electron/notarizing-your-electron-application/
      const { appOutDir } = context;

      const appName = context.packager.appInfo.productFilename;

      return notarize({
        appBundleId: 'com.singlebox.app',
        appPath: `${appOutDir}/${appName}.app`,
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_ID_PASSWORD,
      });
    },
  },
};

builder.build(opts)
  .then(() => {
    console.log('build successful');
  })
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });
