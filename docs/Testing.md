# Testing Guide

Testing guide for TidGi-Desktop using Vitest + React Testing Library for unit tests and Playwright + Cucumber for E2E tests.

## Quick Start

```bash
# Run all tests
pnpm test

# Run unit tests only
pnpm test:unit

# Run E2E tests (requires packaged app)
pnpm run package:dev && pnpm test:e2e

# Run with coverage
pnpm test:unit -- --coverage

# Run a test file you newly written
pnpm test:unit src/services/agentDefinition/__tests__/responsePatternUtility.test.ts
```

## Project Setup

**Test Configuration**: TypeScript-first with `vitest.config.ts`

- Unit tests: Vitest + React Testing Library + jsdom
- E2E tests: Playwright + Cucumber
- Coverage: HTML reports in `coverage/`

**File Structure**:

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
```

## Writing Unit Tests

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

**Centralize common mocks** in `src/__tests__/__mocks__/` directory, and import them in `src/__tests__/setup-vitest.ts`:

- Services from window APIs (`window.service`, `window.remote`, `window.observables`) and container APIs (`@services/container`) are now mocked in `src/__tests__/__mocks__/window.ts` 和 `services-container.ts`
- Common libraries (`react-i18next` in `react-i18next.ts`, logger in `services-log.ts`)

Most of services should be in these mock files. Only mock specific small set of service API in new test files if needed.

**Override in test files** only when you need test-specific data:

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
```

## Writing E2E Tests

### Feature File Example

```gherkin
# features/workspace-management.feature
Feature: Workspace Management
  
  Scenario: Create new workspace
    Given TidGi application is launched
    When I click "Add Workspace" button
    And I enter workspace name "Test Wiki"
    And I click "Create" button
    Then I should see "Test Wiki" in workspace list
```

### Step Definitions

```typescript
// features/stepDefinitions/application.ts
import { Given, When, Then, Before, After } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { ElectronApplication, _electron as electron } from 'playwright';

let electronApp: ElectronApplication;
let page: Page;

Before(async function () {
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../out/TidGi-Desktop/TidGi-Desktop.exe')],
    timeout: 30000,
  });
  page = await electronApp.firstWindow();
});

Given('TidGi application is launched', async function () {
  await page.waitForSelector('[data-testid="main-window"]');
});

When('I click {string} button', async function (buttonText: string) {
  await page.click(`button:has-text("${buttonText}")`);
});

Then('I should see {string} in workspace list', async function (text: string) {
  await expect(page.locator(`[data-testid="workspace-item"]:has-text("${text}")`))
    .toBeVisible();
});
```

## Testing Library Best Practices

### Query Priority (use in this order)

1. **Accessible queries** - `getByRole`, `getByLabelText`, `getByPlaceholderText`
2. **Semantic queries** - `getByAltText`, `getByTitle`
3. **Test IDs** - `getByTestId` (when accessibility queries aren't practical)

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
```

For complete Testing Library guidance, see [Testing Library docs](https://testing-library.com/docs/queries/about).
