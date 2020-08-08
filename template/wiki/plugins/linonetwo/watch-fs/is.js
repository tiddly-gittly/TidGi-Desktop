/**
  title: $:/plugins/linonetwo/watch-fs/is.js
  type: application/javascript
  module-type: startup
 * https://github.com/yuanchuan/node-watch
 * @version 0.6.4
 */

function isIIFE() {
  if (typeof $tw === 'undefined' || !$tw?.node) return;
  exports.name = 'watch-fs_is';
  exports.after = ['load-modules'];
  exports.platforms = ['node'];
  exports.synchronous = true;

  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  function matchObject(item, string) {
    return Object.prototype.toString.call(item) === `[object ${string}]`;
  }

  function checkStat(name, fn) {
    try {
      return fn(name);
    } catch (error) {
      if (/^(ENOENT|EPERM|EACCES)$/.test(error.code)) {
        if (error.code !== 'ENOENT') {
          console.warn('Warning: Cannot access %s', name);
        }
        return false;
      }
      throw error;
    }
  }

  const is = {
    nil(item) {
      return item == undefined;
    },
    array(item) {
      return Array.isArray(item);
    },
    emptyObject(item) {
      for (const key in item) {
        return false;
      }
      return true;
    },
    buffer(item) {
      return Buffer.isBuffer(item);
    },
    regExp(item) {
      return matchObject(item, 'RegExp');
    },
    string(item) {
      return matchObject(item, 'String');
    },
    func(item) {
      return typeof item === 'function';
    },
    number(item) {
      return matchObject(item, 'Number');
    },
    exists(name) {
      return fs.existsSync(name);
    },
    file(name) {
      return checkStat(name, function(n) {
        return fs.statSync(n).isFile();
      });
    },
    samePath(a, b) {
      return path.resolve(a) === path.resolve(b);
    },
    directory(name) {
      return checkStat(name, function(n) {
        return fs.statSync(n).isDirectory();
      });
    },
    symbolicLink(name) {
      return checkStat(name, function(n) {
        return fs.lstatSync(n).isSymbolicLink();
      });
    },
    windows() {
      return os.platform() === 'win32';
    },
  };

  module.exports = is;
}
isIIFE();
