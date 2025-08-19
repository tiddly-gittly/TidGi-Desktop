# Deal with error when pnpm start

## `Uncaught ReferenceError: require is not defined`

Or `Uncaught TypeError: Cannot read properties of undefined (reading 'call')    at __webpack_require__ (index.js:4317:33)`

`pnpm run clean:cache` can fix this.

## Electron download slow

Add `.npmrc` on this project (sometimes the one at home folder is not working).

```npmrc
electron-mirror=https://registry.npmmirror.com/-/binary/electron/
electron_custom_dir={{ version }}
```

and run `node node_modules/electron/install.js` manually.

## Preparing native dependencies `Error: ENOENT: no such file or directory, stat 'xxx/node_modules/.pnpm/node_modules/@types/lodash-es'`

Or `[FAILED: ENOENT: no such file or directory, stat 'C:\Users\linonetwo\Documents\repo-c\TidGi-Desktop\node_modules\.pnpm\node_modules\@radix-ui\react-compose-refs']`

Remove it by run `rm 'xxx/node_modules/.pnpm/node_modules/@types/lodash-es'` fixes it. Maybe pnpm install gets interrupted, and make a file-like symlink, get recognized as binary file. Remove it will work.

## An unhandled rejection has occurred inside Forge about node-abi

Solution: Update `@electron/rebuild` to latest version:

```shell
pnpm up @electron/rebuild@latest
```

## Fetch failed at fetchAvailableUpdates

We use [electron-chrome-web-store](https://github.com/samuelmaddock/electron-browser-shell/blob/master/packages/electron-chrome-web-store/README.md) to load react dev tools, so you need to add `https://clients2.google.com/service/update2/crx` to your Clash/Proxifier list. May need to enable system proxy and TUN mode or so.

## Finalizing package postPackage error

Add `DEBUG=electron-packager` to package, like:

`cross-env NODE_ENV=production DEBUG=electron-packager electron-forge make --platform=win32 --arch=x64`

<https://github.com/electron/forge/issues/3645>

Usually you need to fix [scripts\afterPack.js](../scripts/afterPack.js)

If use pnpm, need to copy dependency binary from `.pnpm` folder, but if add `node-linker=hoisted` to [.npmrc](../.npmrc) then we can simply copy from node_modules folder.

## no such file or directory dprint

> no such file or directory, stat 'TiddlyGit-Desktop/node_modules/.pnpm/node_modules/@dprint/darwin-arm64'

Solution:

```sh
pnpm store prune
pnpm uninstall dprint
pnpm i -D dprint -f
```

## node-gyp failed to rebuild

```js
Running generateAssets hook

›   TOUCH ba23eeee118cd63e16015df367567cb043fed872.intermediate
  ACTION deps_sqlite3_gyp_locate_sqlite3_target_copy_builtin_sqlite3 ba23eeee118cd63e16015df367567cb043fed872.intermediate
  TOUCH Release/obj.target/deps/locate_sqlite3.stamp
  CC(target) Release/obj.target/sqlite3/gen/sqlite3/sqlite3.o
  LIBTOOL-STATIC Release/sqlite3.a
  Usage: /opt/anaconda3/bin/libtool [OPTION]... [MODE-ARG]...
  Try 'libtool --help' for more information.
  libtool:   error: unrecognised option: '-static'
  make: *** [Release/sqlite3.a] Error 1
  rm ba23eeee118cd63e16015df367567cb043fed872.intermediate
  Error: `make` failed with exit code: 2
  at ChildProcess.onExit TiddlyGit-Desktop/node_modules/.pnpm/node-gyp@9.4.0/node_modules/node-gyp/lib/build.js:203:23)
  at ChildProcess.emit (node:events:511:28)
  at ChildProcess._handle.onexit (node:internal/child_process:293:12)

An unhandled rejection has occurred inside Forge:
Error: node-gyp failed to rebuild '/Users/linonetwo/Desktop/repo/TiddlyGit-Desktop/node_modules/.pnpm/better-sqlite3@8.4.0/node_modules/better-sqlite3'
at ChildProcess.<anonymous> TiddlyGit-Desktop/node_modules/.pnpm/@electron+rebuild@3.2.13/node_modules/@electron/rebuild/lib/module-type/node-gyp/node-gyp.js:118:24)
    at ChildProcess.emit (node:events:511:28)
    at ChildProcess._handle.onexit (node:internal/child_process:293:12)
 ELIFECYCLE  Command failed with exit code 1.
```

Solution:

```sh
node_modules/.bin/electron-rebuild -f -w better-sqlite3
```

## During test, The module 'node_modules\better-sqlite3\build\Release\better_sqlite3.node' was compiled against a different Node.js version using

```log
NODE_MODULE_VERSION 135. This version of Node.js requires
NODE_MODULE_VERSION 127. Please try re-compiling or re-installing
the module (for instance, using `npm rebuild` or `npm install`).
```

(The number above is larger)

Don't need to recompile, nodejs and electron have different NODE_MODULE_VERSION. You need to run test using electron as nodejs.

```sh
cross-env ELECTRON_RUN_AS_NODE=true ./node_modules/.bin/electron ./node_modules/vitest/vitest.mjs run
```

### 测试运行有中文乱码 `鈳幆鈳幆鈳幆鈳幆鈳幆鈳幆鈳幆鈳幆鈳幆鈳幆鈳幆鈳幆[4/4]鈳?`

救急可以用 `chcp 65001 && pnpm run test:unit`，如果有空重启电脑，则在时区设置里找到「系统区域设置」里勾选「Unicode Beta版」，重启即可。

## Error: The module '/Users/linonetwo/Desktop/repo/TidGi-Desktop/node_modules/opencv4nodejs-prebuilt/build/Release/opencv4nodejs.node'

```log
was compiled against a different Node.js version using
NODE_MODULE_VERSION 127. This version of Node.js requires
NODE_MODULE_VERSION 135. Please try re-compiling or re-installing
the module (for instance, using `npm rebuild` or `npm install`).
```

(The number above is smaller)

Don't use `npm rebuild` or `npm install`, it doesn't works, it will still build for nodejs. We need to build with electron:

```sh
./node_modules/.bin/electron-rebuild
```

See <https://github.com/justadudewhohacks/opencv4nodejs/issues/401#issuecomment-463434713> if you still have problem rebuild opencv for @nut-tree/nut-js

## Command failed with exit code 1

When you see an error like:

```log
ELIFECYCLE Command failed with exit code 1.
```

This is a generic error and the real cause is usually shown earlier in the log. Sometimes, the actual error is hidden. You can set `DEBUG=electron-packager` to get more detailed logs (see [Show electron-packager debug logs](./Development.md#show-electron-packager-debug-logs)).

For example, after setting the debug variable, you may see:

```log
An unhandled exception has occurred inside Forge:
listen EACCES: permission denied 0.0.0.0:9000
Error: listen EACCES: permission denied 0.0.0.0:9000
```

This means the port 9000 is not accessible, possibly due to permission issues or the port already being in use. Try disable some startup service and restart computer. Some app may occupies port for its own use on startup.

## RangeError: Maximum call stack size exceeded at cloneObjectDeep

```js
const esbuild = require('esbuild');
//...
    implementation: esbuild,
```

If tried to add this to `esbuildLoaderRule` will cause this error. The object contains an internal reference chain (`.default.default`) that triggers recursion when webpack-merge/clone-deep attempts to merge it.
