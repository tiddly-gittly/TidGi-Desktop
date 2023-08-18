# Deal with error when pnpm start

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
