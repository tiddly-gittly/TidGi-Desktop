# Development guide

Development plan of TidGi-Desktop is listed in these [Kanban](https://github.com/tiddly-gittly/TidGi-Desktop/projects).

Explanation of our code can be found in the [Wiki](https://github.com/tiddly-gittly/TidGi-Desktop/wiki).

[Detailed environment setup guide](./environment)

<details>

<summary>To contribute, fork this repo, then clone it and setup development environment</summary>

First-Time Setup Commands

```shell
# Clone the project that you forked
git clone https://github.com/YOUR_ACCOUNT/TidGi-Desktop.git
cd TidGi-Desktop

# Switch to the correct Node.js version (recommended)
nvm use

# Install dependencies
pnpm install

# Full setup with all checks
pnpm start
```

Development Workflow

1. First run: Use `pnpm start` to ensure everything is properly set up
2. Daily development: Use `pnpm run start:dev` for faster iteration
3. After pulling changes: Run `pnpm run build:plugin` if plugins were updated
4. Before committing: Run `pnpm run lint` and `pnpm run test`

Note: You can see webpack error messages at console during development.

</details>

## Package.json Scripts

### Development Scripts

#### Quick Development (Recommended for daily use)

```shell
pnpm run start:dev
```

This is the fastest way to start development. It directly launches the Electron app without running the full setup process, making it ideal for iterative development.

#### Full Development Setup

```shell
pnpm start
```

This runs the complete setup process including:

- `clean` - Clears build artifacts and development folders
- `init:git-submodule` - Updates git submodules
- `build:plugin` - Compiles TiddlyWiki plugins
- `start:dev` - Launches the Electron application

#### Debug Variants

```shell
pnpm run start:dev:debug-worker    # Debug worker threads
pnpm run start:dev:debug-main      # Debug main process
pnpm run start:dev:debug-react     # Debug React renderer, react-devtool will be available in devtools
```

#### Show electron-packager debug logs

If you want to see detailed logs from electron-packager during packaging, set the environment variable `DEBUG=electron-packager`:

- Linux/macOS:

  ```shell
  DEBUG=electron-packager pnpm run start:dev
  ```

- Windows PowerShell:

  ```shell
  $env:DEBUG="electron-packager"; pnpm run start:dev
  ```

This will print verbose debug information from electron-packager to help diagnose packaging issues.

### Build & Package Scripts

```shell
pnpm run build:plugin    # Compile TiddlyWiki plugins only
pnpm run package         # Package for production
pnpm run package:dev     # Package for testing (with NODE_ENV=test)
pnpm run make            # Create distributable packages
```

### Testing Scripts

```shell
pnpm run test           # Run all tests (unit + E2E)
pnpm run test:unit      # Run Jest unit tests only
pnpm run test:e2e       # Run Cucumber E2E tests only
```

### E2E Testing

E2E tests require the packaged application to run. Key points:

- Tests run against the packaged application to simulate real user scenarios
- Uses Playwright + Cucumber for browser automation
- Test reports are saved to `logs/` directory

### Utility Scripts

```shell
pnpm run clean          # Clean build artifacts and temp folders
pnpm run clean:cache    # Clear webpack and build caches, this can fix some error.
pnpm run lint           # Run ESLint
pnpm run lint:fix       # Run ESLint with auto-fix
```

### First-Time Setup Commands

## How to add dependency that used in a worker_thread

For example: `tiddlywiki`

1. `pnpm i tiddlywiki`
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

## Testing

[Testing Guide](./Testing.md)

## FAQ

[ErrorDuringStart](./ErrorDuringStart.md)
