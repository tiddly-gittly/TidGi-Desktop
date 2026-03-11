# E2E

## E2E test open production app

See User profile section above, we need to set `NODE_ENV` as `test` to open with correct profile.

This is done by using `EnvironmentPlugin` in [webpack.plugins.js](../webpack.plugins.js). Note that EsbuildPlugin's `define` doesn't work, it won't set env properly.

## E2E test hang, and refused to exit until ctrl+C

Check `features/stepDefinitions/application.ts` to see if `After` step includes all clean up steps, like closing all windows instances before closing the app, and stop all utility servers.

## Show windows during E2E tests

By default, E2E tests run with hidden windows to avoid stealing focus from the developer. To make the Electron windows visible during a test run (useful for manual observation / debugging), set the `SHOW_E2E_WINDOW` environment variable:

```bash
pnpm exec cross-env SHOW_E2E_WINDOW=1 pnpm test:e2e --tags="@crossWindowSync"
```

## Global shortcut not working

See `src/helpers/testKeyboardShortcuts.ts`
