/* eslint-disable unicorn/prefer-module */
/* eslint-disable @typescript-eslint/no-var-requires */
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
  '@mui/styled-engine': '@mui/styled-engine-sc',
};

module.exports = {
  webpackAlias,
};
