/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('path');

/**
 * @param {string[]} pathFragment
 * @returns {string}
 */
const rootResolve = (...pathFragment) => path.resolve(__dirname, ...pathFragment);

const webpackAlias = {
  '@': rootResolve('src'),
  '@services': rootResolve('src/services'),
};

module.exports = {
  webpackAlias,
};
