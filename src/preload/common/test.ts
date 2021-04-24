/* eslint-disable @typescript-eslint/ban-ts-comment */
if (process.env.NODE_ENV === 'test') {
  // @ts-expect-error for spectron https://github.com/electron-userland/spectron#node-integration
  window.electronRequire = require;
  // @ts-expect-error The operand of a 'delete' operator must be optional.ts(2790)
  delete window.require;
}
