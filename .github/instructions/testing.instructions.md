---
applyTo: '**/*.feature,features/**'
---

# Testing Guide

Testing guide for TidGi-Desktop using Vitest + React Testing Library for unit tests and Playwright + Cucumber for E2E tests.

## Quick Start

```bash
# Run all tests
pnpm test

# Run unit tests only
pnpm test:unit

# Run E2E tests (requires prepare packaged app, but only when you modify code in ./src) Don't need to run this if you only modify .feature file or step definition ts files.
pnpm run test:prepare-e2e
# (When only modify tests in ./features folder, and you have packaged app before, only need to run this.)
pnpm test:e2e
# Or run a specific e2e test by using same `@xxx` as in the `.feature` file.
# Not `-- --tags` , and not `tag`
# Don't directly concat filename after pnpm test:e2e, only unit test can do that, e2e test can't.
pnpm test:e2e --tags="@smoke"
# Or run a single e2e test by `--name`
pnpm test:e2e --name "Wiki-search tool usage" # Not `-- --name` , and not `name`, is is just `--name` and have "" around the value, not omitting `--name`
# Don't directly concat filename after pnpm test:e2e, only unit test can do that, e2e test can't.

# Run with coverage
pnpm test:unit -- --coverage

# Run a single test file to reduce execution time when fixing an issue.
pnpm test:unit src/services/agentDefinition/__tests__/responsePatternUtility.test.ts
# Don't directly concat filename after pnpm test:e2e, only unit test can do that, e2e test can't.

# Start packed e2e electron app manually to see what's going on as a human (AI agent is not allowed to run this, can only run commands above)
cross-env NODE_ENV=test pnpm dlx tsx ./scripts/start-e2e-app.ts
```

Except for above parameters, AI agent can't use other parameters, otherwise complex shell command usage or parameters will require human approval and may not passed.

### Long running script

`prepare` and `test` may run for a long time. Don't execute any shell command like `echo "waiting"` or `Start-Sleep -Seconds 5;`, they are useless, and only will they interrupt the command. You need to check active terminal output in a loop until you see it is truly done.

## Project Setup

Test Configuration: TypeScript-first with `vitest.config.ts`

- Unit tests: Vitest + React Testing Library + jsdom
- E2E tests: Playwright + Cucumber
- Coverage: HTML reports in `coverage/`

Related file structure:

```tree
src/
├── __tests__/           # Global test setup & utilities
├── components/*/
│   └── __tests__/       # Component tests
└── services/*/
    └── __tests__/       # Service tests

features/                # E2E tests
├── *.feature           # Gherkin scenarios
├── stepDefinitions/    # Playwright implementations
└── supports/           # Test utilities

out/                    # `test:prepare-e2e` Bundled production app to test
test-artifacts/xxx-scenario-name/userData-test/           # User setting folder created during `test:e2e`
userData-dev/           # User setting folder created during `start:dev`
wiki-test/           # containing wiki folders created during `test:e2e`
wiki-dev/           # containing wiki folders created during `start:dev`
```

## Writing Unit Tests

See [docs/TestingUnit.md](../../docs/TestingUnit.md)

## Writing E2E Tests

See [docs/TestingE2E.md](../../docs/TestingE2E.md)

### Key E2E Testing Patterns

1. Window Management: Use `getWindow()` with retry logic for reliable window switching
2. Generic Steps: Reusable steps for common UI interactions with descriptive selectors
3. Domain Steps: Specific steps for complex workflows (like agent conversations)
4. Mock Services: Use tagged cleanup for feature-specific resources
5. Streaming Support: Special handling for real-time updates in chat interfaces
6. **Don't think about adding new step definitions** or **change timeout duration**, unless human ask you to do. You should always reuse existing steps, and debug the fundamental reason that causes timeout. Timeout usually because of expected element not percent.
7. If you forget to run `pnpm run test:prepare-e2e` after modify code in `./src` folder, you may find expected elements missing.
8. Usually don't need to add wait time, because most check already will wait for a while. Should use exact test-id to wait internal steps, and test-id should contribute larger than 2 second waiting, otherwise it is useless.

## Testing Library Best Practices

**Important Testing Rules:**

- **Do NOT simplify tests** - write comprehensive, professional unit tests
- **Can add test-ids** when accessibility queries aren't practical
- **Do NOT be lazy** - fix ALL tests until `pnpm test:unit` passes completely
- **Do NOT summarize** until ALL unit tests pass
- **Focus on professional, fix all seemly complex unit tests** before moving to E2E

### Viewing e2e tests

We check `isTest` when `xxxWindow.show()`, so it won't popup while testing. You can clear the desktop windows so you can see it.

### Log

When AI is fixing issues, you can let it add more logs for troubleshooting, and then show the latest test log files (in test-artifacts/xxx-some-scenario-name/userData-test/ ) or [dev log files](../userData-dev/logs) to the AI. Of course, it's best to run tests using `pnpm test:unit`, as it's fast and can be automated by AI without manual intervention. The logs should also be visible in the test, just change the mock of [logger](../src/__tests__/__mocks__/services-log.ts) to use console log, and run a single test to get minimal logs.

If you want to send frontend log to the log file, you can't directly use `import { logger } from '@services/libs/log';` you need to use `void window.service.native.log('error', 'Renderer: xxx', { ...additionalMetadata });`.
Otherwise you will get [Can't resolve 'os' error](./ErrorDuringStart.md)

Only use VSCode tool to read file. Don't ever use shell command to read file. Use shell command to read file may be immediately refused by user, because he don't want to manually approve shell commands.

## User profile

When running tests — especially E2E or other tests that start an Electron instance — the test runner will set Electron's `userData` to `test-artifacts/xxx-scenario-name/userData-test/`. This ensures the test process uses a separate configuration and data directory from any development or production TidGi instance, and prevents accidental triggering of Electron's single-instance lock.

- `src/constants/appPaths.ts`: in test mode we call `app.setPath('userData', path.resolve(sourcePath, '..', 'test-artifacts/xxx-scenario-name/userData-test/'))` to redirect settings and cache.
- `src/helpers/singleInstance.ts`: the main process uses `app.requestSingleInstanceLock()` to enforce single-instance behavior; without a separate `userData` directory, a running local TidGi could conflict with test instances and cause one of them to exit.

For this reason, test workflows in this project (for example when running `pnpm test:e2e` or CI integration tests) need to do with `cross-env NODE_ENV=test` so it creates isolate state in `userData-test`.
