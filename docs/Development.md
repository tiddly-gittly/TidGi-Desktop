# Development guide

## How to add dependency that used in a worker_thread

For example: `tiddlywiki`

1. `npm i tiddlywiki`
1. Add `ExternalsPlugin` in webpack.plugins.js (maybe optional for some deps, tiddlywiki needs this because its custom `require` can't require things that is bundled by webpack. `dugite` don't need this step)
1. Add a `await fs.copy(path.join(projectRoot, 'node_modules/@tiddlygit/tiddlywiki')` in `scripts/afterPack.js` , to copy things to resource folder, that is outside of asar, so it can be used by the worker_thread in electron

## How to add plugin that only execute inside TidGi

Edit `src/services/wiki/wikiWorker.ts`, add another line like:

```ts
wikiInstance.boot.argv = [
  '+plugins/tiddlywiki/filesystem',
  '+plugins/tiddlywiki/tiddlyweb',
```
