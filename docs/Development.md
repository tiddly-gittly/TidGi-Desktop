# Development guide

Development plan of TidGi-Desktop is listed in these [Kanban](https://github.com/tiddly-gittly/TidGi-Desktop/projects).

Explanation of our code can be found in the [Wiki](https://github.com/tiddly-gittly/TidGi-Desktop/wiki).

[Detailed environment setup guide](./environment)

<details>

<summary>To contribute, fork this repo, then clone it and setup development environment</summary>

```shell
# First, clone the project:
git clone https://github.com/YOUR_ACCOUNT/TidGi-Desktop.git
cd TidGi-Desktop
# Or maybe you are just using Github Desktop
# or GitKraken to clone this repo,
# and open it in your favorite code editor and terminal app

# switch to the nodejs version same as electron used version, other wise you may get

# Error: The module '/Users/linonetwo/Desktop/repo/TidGi-Desktop/node_modules/opencv4nodejs-prebuilt/build/Release/opencv4nodejs.node'

# was compiled against a different Node.js version using

# NODE_MODULE_VERSION 88. This version of Node.js requires

# NODE_MODULE_VERSION 93. Please try re-compiling or re-installing

# the module (for instance, using `npm rebuild` or `npm install`).

# See https://github.com/justadudewhohacks/opencv4nodejs/issues/401#issuecomment-463434713 if you still have problem rebuild opencv for @nut-tree/nut-js

nvm use

# install the dependencies

npm i

# Run development mode

# You can see webpack error messages in http://localhost:9000/

npm start

# Build for production

npm run package
```

### Publish

Add a tag like `vx.x.x` to a commit, and push it to the origin, Github will start building App for all three platforms.

After Github Action completed, you can open Releases to see the Draft release created by Github, add some comment and publish it.

</details>

## How to add dependency that used in a worker_thread

For example: `tiddlywiki`

1. `npm i tiddlywiki`
1. Add `ExternalsPlugin` in webpack.plugins.js (maybe optional for some deps, tiddlywiki needs this because its custom `require` can't require things that is bundled by webpack. `dugite` don't need this step)
1. Add a `await fs.copy(path.join(projectRoot, 'node_modules/tiddlywiki')` in `scripts/afterPack.js` , to copy things to resource folder, that is outside of asar, so it can be used by the worker_thread in electron

## How to add plugin that only execute inside TidGi

Edit `src/services/wiki/wikiWorker.ts`, add another line like:

```ts
wikiInstance.boot.argv = [
  '+plugins/tiddlywiki/filesystem',
  '+plugins/tiddlywiki/tiddlyweb',
```

## Managed Library

Some library doesn't fit electron usage, we move their code to this repo and modify them:

- [app-path](https://github.com/sindresorhus/app-path): Need to be installed, so we can copy its binary to the resource folder. This lib is used by `externalApp` below.
  - When not installed in package.json, when make release, forge will throw error `An unhandled rejection has occurred inside Forge: Error: ENOENT: no such file or directory, stat '/Users/linonetwo/Desktop/repo/TiddlyGit-Desktop/node_modules/app-path/main'`
- [externalApp](https://github.com/desktop/desktop/blob/742b4c44c39d64d01048f1e85364d395432e3413/app/src/lib/editors/lookup.ts): This was used by [Github Desktop](https://github.com/desktop/desktop) to lookup the location of editors like VSCode, we use it in context menu to "open in default text editor"

## Don't upgrade these dependency

### pure ESM

Electron forge webpack don't support pure ESM yet

- default-gateway
- electron-unhandled
- date-fns

### Use electron forge's recommended version

- @vercel/webpack-asset-relocator-loader

## Code Tour

[FileProtocol](./features/FileProtocol.md)

TBD

## FAQ

### `Uncaught ReferenceError: require is not defined`

Or `Uncaught TypeError: Cannot read properties of undefined (reading 'call')    at __webpack_require__ (index.js:4317:33)`

`pnpm run clean:cache` can fix this.

### Electron download slow

Add `.npmrc` on this project (sometimes the one at home folder is not working).

```npmrc
electron-mirror=https://registry.npmmirror.com/-/binary/electron/
electron_custom_dir={{ version }}
```

and run `node node_modules/electron/install.js` manually.

### Preparing native dependencies `Error: ENOENT: no such file or directory, stat 'xxx/node_modules/.pnpm/node_modules/@types/lodash-es'`

Or `[FAILED: ENOENT: no such file or directory, stat 'C:\Users\linonetwo\Documents\repo-c\TidGi-Desktop\node_modules\.pnpm\node_modules\@radix-ui\react-compose-refs']`

Remove it by run `rm 'xxx/node_modules/.pnpm/node_modules/@types/lodash-es'` fixes it. Maybe pnpm install gets interrupted, and make a file-like symlink, get recognized as binary file. Remove it will work.
