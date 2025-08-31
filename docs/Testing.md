# Testing Guide

Testing guide for TidGi-Desktop using Vitest + React Testing Library for unit tests and Playwright + Cucumber for E2E tests.

## Quick Start

```bash
# Run all tests
pnpm test

# Run unit tests only
pnpm test:unit

# Run E2E tests (requires prepare packaged app, but only when you modify code in ./src)
pnpm run test:prepare-e2e
# (When only modify tests in ./features folder, and you have packaged app before, only need to run this.)
pnpm test:e2e
# Or run a specific e2e test by using same `@xxx` as in the `.feature` file.
pnpm test:e2e --tags="@smoke"
# Or run a single e2e
pnpm test:e2e --name "Wiki-search tool usage"

# Run with coverage
pnpm test:unit -- --coverage

# Run a single test file to reduce execution time when fixing an issue.
pnpm test:unit src/services/agentDefinition/__tests__/responsePatternUtility.test.ts
```

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
userData-test/           # User setting folder created during `test:e2e`
userData-dev/           # User setting folder created during `start:dev`
```

## Writing Unit Tests

Code here are truncated or shorten. You should always read actuarial test file to learn how to write.

### Component Testing Best Practices

```typescript
// Use semantic queries and user-event for realistic interactions
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('WorkspaceSelector', () => {
  it('should switch to Help page when clicking Help workspace', async () => {
    const user = userEvent.setup();
    render(<WorkspaceSelector />);
    
    // Wait for async content to load
    expect(await screen.findByText('Guide Page Content')).toBeInTheDocument();
    
    // Use realistic user interactions
    const helpText = await screen.findByText('Help');
    await user.click(helpText);
    
    // Assert on user-visible changes
    expect(await screen.findByText('Help Page Content')).toBeInTheDocument();
  });
});
```

### Effective Mocking

```typescript
// Mock complex components simply
vi.mock('../ComplexComponent', () => ({
  default: () => <div data-testid="complex-component">Mocked Component</div>,
}));

// Test-specific data for current test file
const workspacesSubject = new BehaviorSubject([
  { id: 'test-workspace', name: 'Test Wiki' }
]);

// Override global observables for this test
Object.defineProperty(window.observables.workspace, 'workspaces$', {
  value: workspacesSubject.asObservable(),
  writable: true,
});
```

### Global Mock Management

Centralize common mocks in `src/__tests__/__mocks__/` directory, and import them in `src/__tests__/setup-vitest.ts`:

- Services from window APIs (`window.service`, `window.remote`, `window.observables`) and container APIs (`@services/container`) are now mocked in `src/__tests__/__mocks__/window.ts` 和 `services-container.ts`
- Common libraries (`react-i18next` in `react-i18next.ts`, logger in `services-log.ts`)

Most of services should be in these mock files. Only mock specific small set of service API in new test files if needed.

Override in test files only when you need test-specific data:

```typescript
// Only override what's specific to this test
Object.defineProperty(window.observables.workspace, 'workspaces$', {
  value: testSpecificWorkspaces$.asObservable(),
  writable: true,
});
```

This keeps tests focused and reduces duplication across test files.

### Async Testing Patterns

```typescript
// Use findBy* for elements that appear asynchronously
expect(await screen.findByText('Loading complete')).toBeInTheDocument();

// Use waitForElementToBeRemoved for disappearing elements
await waitForElementToBeRemoved(() => screen.queryByText('Loading...'));

// Avoid unnecessary waitFor - prefer findBy*
// ❌ Don't do this
await waitFor(() => {
  expect(screen.getByText('Content')).toBeInTheDocument();
});

// ✅ Do this instead
expect(await screen.findByText('Content')).toBeInTheDocument();

// Handle async component initialization to avoid act(...) warnings
// ✅ Create helper that waits for async loading
const renderComponent = async () => {
  const result = render(<AsyncComponent />);
  await waitFor(() => {
    expect(screen.queryByText('Loading')).not.toBeInTheDocument();
  });
  return result;
};

// ✅ Use in tests
it('should test feature after loading', async () => {
  await renderComponent();
  // Now safe to test without act warnings
});

// ✅ For loading state tests, wait after assertion
it('should show loading initially', async () => {
  render(<AsyncComponent />);
  expect(screen.getByText('Loading')).toBeInTheDocument();
  
  // Wait for completion to prevent warnings in subsequent async updates
  await waitFor(() => {
    expect(screen.queryByText('Loading')).not.toBeInTheDocument();
  });
});
```

## Writing E2E Tests

### Feature File Example

```gherkin
# features/agent.feature
Feature: Agent Workflow
  Background:
    Given I launch the TidGi application
    And I wait for the page to load completely

  @agent
  Scenario: Complete agent workflow
    # Use generic steps for common UI interactions
    When I click on a "settings button" element with selector "#open-preferences-button"
    When I switch to "preferences" window
    When I type "TestProvider" in "provider name input" element with selector "[data-testid='new-provider-name-input']"
    # ... more generic steps
    Then I should see 4 messages in chat history
```

### Step Definitions Architecture

The E2E testing framework uses a World-based architecture with Playwright + Cucumber:

```typescript
// features/stepDefinitions/application.ts - Generic application steps
export class ApplicationWorld {
  app: ElectronApplication | undefined;
  // ...
}

// Generic step definitions you usually must reuse.
When('I click on a(n) {string} element with selector {string}', 
  async function(elementComment: string, selector: string) {
    // ...
  }
);

// Don't define specific step only for you own use, that would be selfish.
When('(Dont do this) I click on a specific button and wait for 2 seconds.', 
  async function() {
    // Strictly forbidden.
  }
);
```

### Key E2E Testing Patterns

1. Window Management: Use `getWindow()` with retry logic for reliable window switching
2. Generic Steps: Reusable steps for common UI interactions with descriptive selectors
3. Domain Steps: Specific steps for complex workflows (like agent conversations)
4. Mock Services: Use tagged cleanup for feature-specific resources
5. Streaming Support: Special handling for real-time updates in chat interfaces
6. **Don't think about adding new step definitions** or **change timeout duration**, unless human ask you to do. You should always reuse existing steps, and debug the fundamental reason that causes timeout. Timeout usually because of expected element not percent.
7. If you forget to run `pnpm run test:prepare-e2e` after modify code in `./src` folder, you may find expected elements missing.

## Testing Library Best Practices

### Query Priority (use in this order)

1. Accessible queries - `getByRole`, `getByLabelText`, `getByPlaceholderText`
2. Semantic queries - `getByAltText`, `getByTitle`
3. Test IDs - `getByTestId` (when accessibility queries aren't practical)

### Async Patterns

- Use `findBy*` instead of `getBy*` + `waitFor`
- Use `user-event` instead of `fireEvent` for realistic interactions
- Wait for initial async state in `beforeEach` to avoid act() warnings

### Common Antipatterns to Avoid

```typescript
// ❌ Testing implementation details
expect(component.state.isLoading).toBe(false);

// ✅ Testing user-visible behavior  
expect(screen.queryByText('Loading...')).not.toBeInTheDocument();

// ❌ Using act() wrapper unnecessarily
act(() => {
  fireEvent.click(button);
});

// ✅ Using proper async testing
const user = userEvent.setup();
await user.click(button);

// ❌ Not handling async component initialization
render(<AsyncComponent />);
expect(screen.getByText('Content')).toBeInTheDocument(); // May cause act warnings

// ✅ Wait for async initialization to complete
const renderAsync = async () => {
  const result = render(<AsyncComponent />);
  await waitFor(() => expect(screen.queryByText('Loading')).not.toBeInTheDocument());
  return result;
};
```

For complete Testing Library guidance, see [Testing Library docs](https://testing-library.com/docs/queries/about).

### Log

When AI is fixing issues, you can let it add more logs for troubleshooting, and then show the [latest test log files](../userData-test/logs) or [dev log files](../userData-dev/logs) to the AI. Of course, it's best to run tests using `pnpm test:unit`, as it's fast and can be automated by AI without manual intervention. The logs should also be visible in the test, just change the mock of [logger](../src/__tests__/__mocks__/services-log.ts) to use console log, and run a single test to get minimal logs.

If you want to send frontend log to the log file, you can't directly use `import { logger } from '@services/libs/log';` you need to use `void window.service.native.log('error', 'Renderer: xxx', { ...additionalMetadata });`.
Otherwise you will get [Can't resolve 'os' error](./ErrorDuringStart.md)

## User profile

When running tests — especially E2E or other tests that start an Electron instance — the test runner will set Electron's `userData` to `userData-test`. This ensures the test process uses a separate configuration and data directory from any development or production TidGi instance, and prevents accidental triggering of Electron's single-instance lock.

- `src/constants/appPaths.ts`: in test mode we call `app.setPath('userData', path.resolve(sourcePath, '..', 'userData-test'))` to redirect settings and cache.
- `src/helpers/singleInstance.ts`: the main process uses `app.requestSingleInstanceLock()` to enforce single-instance behavior; without a separate `userData` directory, a running local TidGi could conflict with test instances and cause one of them to exit.

For this reason, test workflows in this project (for example when running `pnpm test:e2e` or CI integration tests) need to do with `cross-env NODE_ENV=test` so it creates isolate state in `userData-test`.

## Errors

### close timed out after 10000ms / FILEHANDLE (unknown stack trace)

This happens because Electron/Vitest child processes do not inherit the ELECTRON_RUN_AS_NODE environment variable, so resources cannot be cleaned up and handles leak.

Do not set `ELECTRON_RUN_AS_NODE` in `vitest.config.ts` via `process.env.ELECTRON_RUN_AS_NODE = 'true'` — this only affects the main process, not child processes.

Always use cross-env in your test script. For example:

`cross-env ELECTRON_RUN_AS_NODE=1 pnpm exec ./node_modules/.bin/electron ./node_modules/vitest/vitest.mjs run`

Or run manually in shell: `$env:ELECTRON_RUN_AS_NODE=1; pnpm run test:unit`

We use `ELECTRON_RUN_AS_NODE` to solve native modules (like better-sqlite3) being compiled for the wrong Node.js version, see the section in [ErrorDuringStart.md](./ErrorDuringStart.md#during-test-the-module-node_modulesbetter-sqlite3buildreleasebetter_sqlite3node-was-compiled-against-a-different-nodejs-version-using).

### An update to Component inside a test was not wrapped in act(...)

This warning occurs when React components perform asynchronous state updates during test execution. Common causes:

- Components with `useEffect` that fetch data on mount
- Async API calls that update component state
- Timers or intervals that trigger state changes

**Solution**: Wait for async operations to complete using helper functions:

```typescript
// Create async render helper
const renderAsyncComponent = async () => {
  const result = render(<AsyncComponent />);
  // Wait for loading to complete
  await waitFor(() => {
    expect(screen.queryByText('Loading')).not.toBeInTheDocument();
  });
  return result;
};

// Use in tests
it('should test feature', async () => {
  await renderAsyncComponent();
  // Now safe to interact without warnings
});
```

Avoid explicitly using `act()` - React Testing Library handles most cases automatically when using proper async patterns.

### E2E test open production app

See User profile section above, we need to set `NODE_ENV` as `test` to open with correct profile.

This is done by using `EnvironmentPlugin` in [webpack.plugins.js](../webpack.plugins.js). Note that EsbuildPlugin's `define` doesn't work, it won't set env properly.
