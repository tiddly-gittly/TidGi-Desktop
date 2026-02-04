# Writing Unit Tests

Code here are truncated or shorten. You should always read actuarial test file to learn how to write.

## Component Testing Best Practices

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

## Effective Mocking

```typescript
// Mock complex components simply
vi.mock('../ComplexComponent', () => ({
  default: () => <div data-testid='complex-component'>Mocked Component</div>,
}));

// Test-specific data for current test file
const workspacesSubject = new BehaviorSubject([
  { id: 'test-workspace', name: 'Test Wiki' },
]);

// Override global observables for this test
Object.defineProperty(window.observables.workspace, 'workspaces$', {
  value: workspacesSubject.asObservable(),
  writable: true,
});
```

## Global Mock Management

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

## Async Testing Patterns

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

## Feature File Example

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

## Step Definitions Architecture

The E2E testing framework uses a World-based architecture with Playwright + Cucumber:

```typescript
// features/stepDefinitions/application.ts - Generic application steps
export class ApplicationWorld {
  app: ElectronApplication | undefined;
  // ...
}

// Generic step definitions you usually must reuse.
When('I click on a(n) {string} element with selector {string}', async function(elementComment: string, selector: string) {
  // ...
});

// Don't define specific step only for you own use, that would be selfish.
When('(Dont do this) I click on a specific button and wait for 2 seconds.', async function() {
  // Strictly forbidden.
});
```

## Query Priority (use in this order)

1. Accessible queries - `getByRole`, `getByLabelText`, `getByPlaceholderText`
2. Semantic queries - `getByAltText`, `getByTitle`
3. Test IDs - `getByTestId` (when accessibility queries aren't practical)

## Async Patterns

- Use `findBy*` instead of `getBy*` + `waitFor`
- Use `user-event` instead of `fireEvent` for realistic interactions
- Wait for initial async state in `beforeEach` to avoid act() warnings

## Common Antipatterns to Avoid

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
