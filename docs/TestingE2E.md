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

## E2E Test Sharding (Parallel CI)

When the full E2E suite is too slow for a single CI machine or hits memory limits (OOM), you can split it into N stable shards — each shard runs a different subset of feature files. Multiple CI runners or sub-agents can each run one shard in parallel.

### How it works

Set the `TIDGI_E2E_SHARD` environment variable in the format `N/M`:

- `N` = total number of shards (e.g. 3 machines)
- `M` = this runner's shard index (1-based, e.g. 1, 2, or 3)

```bash
# Runner 1 runs shard 1 of 3
TIDGI_E2E_SHARD=3/1 pnpm test:e2e

# Runner 2 runs shard 2 of 3
TIDGI_E2E_SHARD=3/2 pnpm test:e2e

# Runner 3 runs shard 3 of 3
TIDGI_E2E_SHARD=3/3 pnpm test:e2e
```

Sharding is **stable**: feature files are sorted alphabetically and divided evenly by count. A given `.feature` file always lands in the same shard regardless of filesystem ordering or OS.

### Calibration with shards

Calibration (the preflight that discovers timeout values) is **not** affected by `TIDGI_E2E_SHARD` — it always runs all `@calibrate`-tagged scenarios across every feature file. The resulting `.calibration.json` is shared across all shards.

Calibration runs automatically as a preflight step when you invoke `pnpm test:e2e`, so no separate command is needed. Each sharded invocation runs its own calibration automatically (unless the implementation changes to support pre-shared calibration in the future):

```bash
# Run shards in parallel — each will auto-calibrate before running its subset of feature files
TIDGI_E2E_SHARD=3/1 pnpm test:e2e &
TIDGI_E2E_SHARD=3/2 pnpm test:e2e &
TIDGI_E2E_SHARD=3/3 pnpm test:e2e &
```

### Without sharding (backward compatible)

When `TIDGI_E2E_SHARD` is not set, the suite runs all feature files as before — no behavior change.

## Monitoring CI Runs

When you push E2E fixes, use `gh run watch` to wait for the CI workflow to complete instead of polling with `gh run list`:

```bash
gh run watch <run-id>
```

This streams the job logs live and exits when the run finishes, saving time and API calls compared to repeated polling.
