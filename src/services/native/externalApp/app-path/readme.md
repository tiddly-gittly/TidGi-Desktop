# Modified app-path

this is copied from [sindresorhus/app-path](https://github.com/sindresorhus/app-path) as it is esm and I didn't have time figure out how to import it

```js
App threw an error during load
Error [ERR_REQUIRE_ESM]: require() of ES Module /Users/TiddlyGit-Desktop/node_modules/app-path/index.js from /Users/TiddlyGit-Desktop/.webpack/main/index.js not supported.
Instead change the require of /Users/TiddlyGit-Desktop/node_modules/app-path/index.js in /Users/TiddlyGit-Desktop/.webpack/main/index.js to a dynamic import() which is available in all CommonJS modules.
```

And we use app-path's binary via [scripts/afterPack.js](scripts/afterPack.js)'s `await fs.copy(path.join(projectRoot, 'node_modules', 'app-path'), path.join(cwd, 'node_modules', 'app-path'));`

And the last version of app-path says `spawn ./main ENOENT` while `ls` says `main` binary is just there...
