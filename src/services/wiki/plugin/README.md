# Wiki Plugins

This folder contains methods to support some tw plugin. These plugins rely on TidGi's API to run.

Some plugins are compiled using `scripts/compilePlugins.mjs`, when adding a new `.ts` file with corresponding `.js.meta` (not `.ts.meta`), you will need to update `scripts/compilePlugins.mjs` to add the entry point, otherwise that file won't appear on the bundled plugin folder.
