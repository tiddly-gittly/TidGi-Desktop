/* eslint-disable no-console */
const builder = require('electron-builder');
const { notarize } = require('electron-notarize');

const { Platform } = builder;

console.log(`Machine: ${process.platform}`);

const opts = {
  targets: Platform.MAC.createTarget(),
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
    directories: {
      buildResources: 'build-resources',
    },
    mac: {
      category: 'public.app-category.productivity',
      hardenedRuntime: true,
      gatekeeperAssess: false,
      entitlements: 'build-resources/entitlements.mac.plist',
      entitlementsInherit: 'build-resources/entitlements.mac.plist',
    },
    afterSign: (context) => {
      const shouldNotarize = context.electronPlatformName === 'darwin' && (
        process.env.TRAVIS_PULL_REQUEST === 'false'
        || process.env.CSC_FOR_PULL_REQUEST === 'true');
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
