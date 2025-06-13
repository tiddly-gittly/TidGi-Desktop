# Testing Guide

Comprehensive testing guide for TidGi-Desktop using Jest + React Testing Library for unit tests and Playwright + Cucumber for E2E tests.

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
```

## Project Setup

**Test Configuration**: TypeScript-first with `jest.config.ts`

- Unit tests: Jest + React Testing Library + jsdom
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

### Basic Component Test

```typescript
// src/components/Button/__tests__/Button.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../Button';

describe('Button', () => {
  it('should handle click events', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click me</Button>);
    
    fireEvent.click(screen.getByText('Click me'));
    
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
```

### Testing with Material-UI

```typescript
import { ThemeProvider, createTheme } from '@mui/material/styles';

const renderWithTheme = (component: React.ReactElement) => {
  return render(
    <ThemeProvider theme={createTheme()}>
      {component}
    </ThemeProvider>
  );
};
```

### Async & API Tests

```typescript
// Mock fetch globally
global.fetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

it('should fetch data successfully', async () => {
  const mockData = { id: 1, name: 'Test' };
  
  (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
    ok: true,
    json: async () => mockData,
  } as Response);

  const result = await fetchUserData(1);
  
  expect(fetch).toHaveBeenCalledWith('/api/users/1');
  expect(result).toEqual(mockData);
});
```

### Testing Electron IPC

```typescript
// Mock electron
vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: vi.fn(),
    send: vi.fn(),
    on: vi.fn(),
  },
}));

import { ipcRenderer } from 'electron';

it('should communicate with main process', async () => {
  const mockResponse = { success: true };
  (ipcRenderer.invoke as jest.MockedFunction<typeof ipcRenderer.invoke>)
    .mockResolvedValueOnce(mockResponse);

  const result = await electronService.getData();
  
  expect(ipcRenderer.invoke).toHaveBeenCalledWith('get-data');
  expect(result).toEqual(mockResponse);
});
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

## Best Practices

### Unit Testing

- **Test behavior, not implementation** - Focus on user interactions and outputs
- **Use data-testid** for reliable element selection
- **Mock external dependencies** - APIs, file system, Electron APIs
- **Test error cases** - Don't just test the happy path

### E2E Testing

- **Use semantic selectors** - `data-testid`, `role`, or text content
- **Wait for elements** - Use `waitFor`, `findBy` queries
- **Test real workflows** - Complete user scenarios, not isolated features
- **Keep scenarios focused** - One feature per scenario

### General

- **Arrange-Act-Assert** pattern for clear test structure
- **Descriptive test names** - What should happen, when, under what conditions
- **Clean up between tests** - Reset mocks, clear state

## Debugging

```bash
# Debug unit tests
pnpm test:unit -- --runInBand src/path/to/test.ts

# Debug E2E tests (headed mode)
pnpm test:e2e -- --headed

# Use screen.debug() to see DOM state
screen.debug(); // In React tests

# Check coverage gaps
pnpm test:unit -- --coverage
# Open coverage/lcov-report/index.html
```

## Common Issues

| Issue            | Solution                                        |
| ---------------- | ----------------------------------------------- |
| Tests timeout    | Check for unresolved promises, increase timeout |
| Mock not working | Ensure mocks are set up before imports          |
| CSS/Asset errors | Check `moduleNameMapper` in `jest.config.ts`    |
| E2E test fails   | Verify app is packaged, check selectors         |

## CI Integration

Tests run automatically on PRs and main branch pushes. Ensure all tests pass:

```bash
pnpm test        # Full test suite
pnpm lint:fix    # Fix linting issues
```

## References

- [Jest](https://jestjs.io/docs/getting-started) | [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Playwright](https://playwright.dev/docs/intro) | [Cucumber](https://cucumber.io/docs/cucumber/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
