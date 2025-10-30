/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// Only export in Node.js environment
if ($tw.node) {
  const WatchFileSystemAdaptor = require('./WatchFileSystemAdaptor').WatchFileSystemAdaptor;
  exports.adaptorClass = WatchFileSystemAdaptor;
}
