const path = require('path');
const fs = require('fs-extra');

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
