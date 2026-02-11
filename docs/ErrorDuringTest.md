# Errors

## close timed out after 10000ms / FILEHANDLE (unknown stack trace)

This happens because Electron/Vitest child processes do not inherit the ELECTRON_RUN_AS_NODE environment variable, so resources cannot be cleaned up and handles leak.

Do not set `ELECTRON_RUN_AS_NODE` in `vitest.config.ts` via `process.env.ELECTRON_RUN_AS_NODE = 'true'` — this only affects the main process, not child processes.

Always use cross-env in your test script. For example:

`cross-env ELECTRON_RUN_AS_NODE=1 pnpm exec ./node_modules/.bin/electron ./node_modules/vitest/vitest.mjs run`

Or run manually in shell: `$env:ELECTRON_RUN_AS_NODE=1; pnpm run test:unit`

We use `ELECTRON_RUN_AS_NODE` to solve native modules (like better-sqlite3) being compiled for the wrong Node.js version, see the section in [ErrorDuringStart.md](./ErrorDuringStart.md#during-test-the-module-node_modulesbetter-sqlite3buildreleasebetter_sqlite3node-was-compiled-against-a-different-nodejs-version-using).

### Module did not self-register: '/home/runner/work/TidGi-Desktop/TidGi-Desktop/node_modules/better-sqlite3/build/Release/better_sqlite3.node'

May needs `pnpm exec electron-rebuild -f -w better-sqlite3`.

## An update to Component inside a test was not wrapped in act(...)

This warning occurs when React components perform asynchronous state updates during test execution. Common causes:

- Components with `useEffect` that fetch data on mount
- Async API calls that update component state
- Timers or intervals that trigger state changes
- **RxJS Observable subscriptions** that trigger state updates

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

// For tests that trigger state updates, wait for UI to stabilize
it('should update when data changes', async () => {
  render(<Component />);

  // Trigger update
  someObservable.next(newData);

  // Wait for UI to reflect the change
  await waitFor(() => {
    expect(screen.getByText('Updated Content')).toBeInTheDocument();
  });
});
```

Avoid explicitly using `act()` - React Testing Library handles most cases automatically when using proper async patterns.

**Critical**: To avoid act warnings with RxJS Observables:

1. **Never call `.next()` on BehaviorSubject during test execution** - Set all data before rendering
2. **Don't trigger Observable updates via mocked APIs** - Test the component's configuration, not the full update cycle
3. **For loading state tests** - Unmount immediately after assertion to prevent subsequent updates
4. **Follow the Main component test pattern** - Create Observables at file scope, never update them in tests

**Example of correct Observable testing:**

```typescript
// ❌ Wrong: Updating Observable during test
it('should update when data changes', async () => {
  render(<Component />);
  preferencesSubject.next({ setting: false }); // This causes act warnings!
  await waitFor(...);
});

// ✅ Correct: Observable created at file scope, never updated
const preferencesSubject = new BehaviorSubject({ setting: true });

describe('Component', () => {
  it('should render correctly', async () => {
    const { unmount } = render(<Component />);
    expect(screen.getByText('Content')).toBeInTheDocument();
    // Optional: unmount() if testing transient state
  });
});
```
