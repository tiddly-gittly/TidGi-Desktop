/**
  title: $:/plugins/linonetwo/watch-fs/has-native-recursive.js
  type: application/javascript
  module-type: startup
 * https://github.com/yuanchuan/node-watch
 * @version 0.6.4
 */
function hasNativeRecursiveIIFE() {
  if (typeof $tw === 'undefined' || !$tw?.node) return;
  exports.name = 'watch-fs_has-native-recursive';
  exports.after = ['load-modules', 'watch-fs_is'];
  exports.platforms = ['node'];
  exports.synchronous = true;

  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const is = require('./is');

  let IS_SUPPORT;
  const TEMP_DIR = (os.tmpdir && os.tmpdir()) || process.env.TMPDIR || process.env.TEMP || process.cwd();

  function TemporaryStack() {
    this.stack = [];
  }

  TemporaryStack.prototype = {
    create(type, base) {
      const name = path.join(
        base,
        `node-watch-${Math.random()
          .toString(16)
          .slice(2)}`,
      );
      this.stack.push({ name, type });
      return name;
    },
    write(/* file */) {
      for (const argument of arguments) {
        fs.writeFileSync(argument, ' ');
      }
    },
    mkdir(/* dirs */) {
      for (const argument of arguments) {
        fs.mkdirSync(argument);
      }
    },
    cleanup(fn) {
      try {
        let temporary;
        while ((temporary = this.stack.pop())) {
          const { type } = temporary;
          const { name } = temporary;
          if (type === 'file' && is.file(name)) {
            fs.unlinkSync(name);
          } else if (type === 'dir' && is.directory(name)) {
            fs.rmdirSync(name);
          }
        }
      } finally {
        if (is.func(fn)) fn();
      }
    },
  };

  let pending = false;

  module.exports = function hasNativeRecursive(fn) {
    if (!is.func(fn)) {
      return false;
    }
    if (IS_SUPPORT !== undefined) {
      return fn(IS_SUPPORT);
    }

    if (!pending) {
      pending = true;
    }
    // check again later
    else {
      return setTimeout(function() {
        hasNativeRecursive(fn);
      }, 300);
    }

    const stack = new TemporaryStack();
    const parent = stack.create('dir', TEMP_DIR);
    const child = stack.create('dir', parent);
    const file = stack.create('file', child);

    stack.mkdir(parent, child);

    const options = { recursive: true };
    let watcher;

    try {
      watcher = fs.watch(parent, options);
    } catch (error) {
      if (error.code == 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM') {
        return fn((IS_SUPPORT = false));
      }
      throw error;
    }

    if (!watcher) {
      return false;
    }

    const timer = setTimeout(function() {
      watcher.close();
      stack.cleanup(function() {
        fn((IS_SUPPORT = false));
      });
    }, 200);

    watcher.on('change', function(event, name) {
      if (path.basename(file) === path.basename(name)) {
        watcher.close();
        clearTimeout(timer);
        stack.cleanup(function() {
          fn((IS_SUPPORT = true));
        });
      }
    });
    stack.write(file);
  };
}
hasNativeRecursiveIIFE();
