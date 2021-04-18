/* eslint-disable @typescript-eslint/ban-ts-comment */
if (process.env.NODE_ENV === 'test') {
  // @ts-expect-error for spectron https://github.com/electron-userland/spectron#node-integration
  window.electronRequire = require;
  delete window.require;
}
