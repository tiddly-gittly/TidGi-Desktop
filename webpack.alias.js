/* eslint-disable @typescript-eslint/no-var-requires */
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'path'.
const path = require('path');
const fs = require('fs-extra');

/**
 * @param {string[]} pathFragment
 * @returns {string}
 */
// @ts-expect-error ts-migrate(7019) FIXME: Rest parameter 'pathFragment' implicitly has an 'a... Remove this comment to see the full error message
const rootResolve = (...pathFragment) => path.resolve(__dirname, ...pathFragment);

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'webpackAli... Remove this comment to see the full error message
const webpackAlias = {
  '@': rootResolve('src'),
  '@services': rootResolve('src/services'),
};

module.exports = {
  webpackAlias,
};
