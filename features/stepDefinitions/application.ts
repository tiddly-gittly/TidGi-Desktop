import { AfterStep, Given, setWorldConstructor, Status, When } from '@cucumber/cucumber';
import { backOff } from 'exponential-backoff';
import fs from 'fs-extra';
import path from 'path';
import { _electron as electron } from 'playwright';
import type { ElectronApplication, Page } from 'playwright';
import { WindowNames } from '../../src/services/windows/WindowProperties';
import { MockOAuthServer } from '../supports/mockOAuthServer';
import { MockOpenAIServer } from '../supports/mockOpenAI';
import { getPackedAppPath, makeSlugPath } from '../supports/paths';
import { CUCUMBER_GLOBAL_TIMEOUT } from '../supports/timeouts';
import { captureScreenshot, captureWindowScreenshot } from '../supports/webContentsViewHelper';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️  CRITICAL WARNING FOR ALL AI AGENTS - READ THIS BEFORE ANY MODIFICATION ⚠️
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ABSOLUTE RULES - NO EXCEPTIONS:
 *
 * 1. NEVER INCREASE TIMEOUT VALUES! TIMEOUT = FAILURE = REAL BUG!
 *    - Timeout is a SYMPTOM, not the disease
 *    - Fix the ROOT CAUSE in application code, not the timeout
 *
 * 2. MAXIMUM TIMEOUTS (STRICTLY ENFORCED):
 *    - Local: 5 seconds
 *    - CI: 10 seconds (exactly 2x local, NO MORE)
 *
 * 3. BEFORE MODIFYING ANY TIMEOUT:
 *    - STOP! Read docs/Testing.md completely
 *    - Investigate test-artifacts/{scenarioSlug}/userData-test/logs/
 *    - Find the REAL BUG (SQLite errors, missing elements, failed loads)
 *    - Fix the APPLICATION CODE, not the test
 *
 * 4. THIS HAS BEEN VIOLATED 3 TIMES - DO NOT MAKE IT 4!
 *
 * Per docs/Testing.md: "Timeout usually because of expected element not present."
 * The test is waiting for something that will NEVER happen due to a BUG.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Backoff configuration for retries
const BACKOFF_OPTIONS = {
  numOfAttempts: 8,
  startingDelay: 100,
  timeMultiple: 2,
};

// Helper function to check if window type is valid and return the corresponding WindowNames
export function checkWindowName(windowType: string): WindowNames {
  // Exact match - windowType must be a valid WindowNames enum key
  if (windowType in WindowNames) {
    return (WindowNames as Record<string, WindowNames>)[windowType];
  }
  throw new Error(`Window type "${windowType}" is not a valid WindowNames. Check the WindowNames enum in WindowProperties.ts. Available: ${Object.keys(WindowNames).join(', ')}`);
}

export class ApplicationWorld {
  app: ElectronApplication | undefined;
  appLaunchPromise: Promise<void> | undefined;
  mainWindow: Page | undefined; // Keep for compatibility during transition
  currentWindow: Page | undefined; // New state-managed current window
  mockOpenAIServer: MockOpenAIServer | undefined;
  mockOAuthServer: MockOAuthServer | undefined;
  savedWorkspaceId: string | undefined; // For storing workspace ID between steps
  scenarioName: string = 'default'; // Scenario name from Cucumber pickle
  scenarioSlug: string = 'default'; // Sanitized scenario name for file paths
  scenarioTags: string[] = [];
  providerConfig: import('@services/externalAPI/interface').AIProviderConfig | undefined; // Scenario-specific AI provider config
  appPid: number | undefined; // Playwright Electron process PID for hard-kill cleanup
  launchEnvOverrides: Record<string, string> = {};

  // Helper method to check if window is visible
  async isWindowVisible(page: Page): Promise<boolean> {
    if (!this.app) return false;
    try {
      const browserWindow = await this.app.browserWindow(page);
      return await browserWindow.evaluate((win: Electron.BrowserWindow) => {
        if (!win.isVisible()) {
          return false;
        }
        if ((process.platform !== 'win32' && process.platform !== 'linux') || process.env.SHOW_E2E_WINDOW) {
          return true;
        }
        // For the tidgi mini window, consult the actual window service in the main process
        // (via renderer IPC) to decide visibility. This correctly accounts for the
        // e2ePaintOnlyWindows mechanism. Use window.meta().windowName (set from
        // process.argv at creation time) instead of mutable title or dimensions.
        return win.webContents.executeJavaScript(`
          (() => {
            const windowName = window.meta?.()?.windowName;
            if (windowName !== 'tidgiMiniWindow') return true;
            return window.service?.window?.isTidgiMiniWindowOpen?.() ?? false;
          })()
        `) as Promise<boolean>;
      });
    } catch {
      return false;
    }
  }

  // Helper method to wait for window with retry logic
  async waitForWindowCondition(
    windowType: string,
    condition: (window: Page | undefined, isVisible: boolean) => boolean,
  ): Promise<boolean> {
    if (!this.app) return false;

    try {
      await backOff(
        async () => {
          const targetWindow = await this.findWindowByType(windowType);
          const visible = targetWindow ? await this.isWindowVisible(targetWindow) : false;

          if (!condition(targetWindow, visible)) {
            throw new Error('Condition not met');
          }
        },
        BACKOFF_OPTIONS,
      );
      return true;
    } catch {
      return false;
    }
  }

  // Helper method to find window by type - strict WindowNames matching
  async findWindowByType(windowType: string): Promise<Page | undefined> {
    if (!this.app) return undefined;

    // Validate window type first
    const windowName = checkWindowName(windowType);

    const pages = this.app.windows();

    if (windowName === WindowNames.main) {
      // Main window is the first/primary window, typically showing guide, agent, help, or wiki pages
      // It's the window that opens on app launch
      const allWindows = pages.filter(page => !page.isClosed());
      if (allWindows.length === 0) {
        return undefined;
      }
      if (allWindows.length === 1) {
        return allWindows[0];
      }
      // Multiple windows — find the one whose preload marker identifies it as main window.
      // This avoids unreliable title/dimension heuristics.
      for (const page of allWindows) {
        try {
          const metaWindowName = await page.evaluate(() => {
            const windowWithMeta = window as Window & { meta?: () => { windowName?: string } };
            return windowWithMeta.meta?.()?.windowName;
          }) as WindowNames | undefined;
          if (metaWindowName === WindowNames.main) {
            return page;
          }
        } catch {
          continue;
        }
      }
      // Fallback: if meta lookup fails for all pages, return the first one.
      return allWindows[0];
    } else if (windowName === WindowNames.tidgiMiniWindow) {
      // Identify the tidgi mini window by its immutable windowName marker from the preload script.
      // The preload reads process.argv (set via additionalArguments at BrowserWindow creation) and
      // exposes window.meta().windowName via contextBridge. This is reliable because it does not
      // depend on mutable title or restored window dimensions.
      for (const page of pages.filter(p => !p.isClosed())) {
        try {
          const metaWindowName = await page.evaluate(() => {
            const windowWithMeta = window as Window & { meta?: () => { windowName?: string } };
            return windowWithMeta.meta?.()?.windowName;
          }) as WindowNames | undefined;
          if (metaWindowName === WindowNames.tidgiMiniWindow) {
            return page;
          }
        } catch {
          // page.evaluate may fail if the renderer isn't ready yet — skip and try next
          continue;
        }
      }
      return undefined;
    } else {
      // For regular windows (preferences, about, addWorkspace, etc.)
      return pages.find(page => {
        if (page.isClosed()) return false;
        const url = page.url() || '';
        // Match exact route paths: /#/windowType or ending with /windowType
        return url.includes(`#/${windowType}`) || url.endsWith(`/${windowType}`);
      });
    }
  }

  async getWindow(windowType: string = 'main'): Promise<Page | undefined> {
    if (!this.app) return undefined;

    // Special case for 'current' window
    if (windowType === 'current') {
      return this.currentWindow;
    }

    // Use the findWindowByType method with retry logic using backoff
    try {
      return await backOff(
        async () => {
          const window = await this.findWindowByType(windowType);
          if (!window) {
            throw new Error(`Window ${windowType} not found`);
          }
          return window;
        },
        BACKOFF_OPTIONS,
      );
    } catch (error) {
      // If it's an invalid window type error, re-throw it
      if (error instanceof Error && error.message.includes('is not a valid WindowNames')) {
        throw error;
      }
      return undefined;
    }
  }
}

setWorldConstructor(ApplicationWorld);

async function launchTidGiApplication(world: ApplicationWorld): Promise<void> {
  const packedAppPath = getPackedAppPath();

  const app = await electron.launch({
    executablePath: packedAppPath,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      '--force-device-scale-factor=1',
      '--high-dpi-support=1',
      '--force-color-profile=srgb',
      '--disable-extensions',
      '--disable-plugins',
      '--disable-default-apps',
      '--virtual-time-budget=1000',
      '--run-all-compositor-stages-before-draw',
      '--disable-checker-imaging',
      ...(process.env.CI && process.platform === 'linux'
        ? [
          '--disable-background-mode',
          '--disable-features=VizDisplayCompositor',
          '--use-gl=swiftshader',
          '--disable-accelerated-2d-canvas',
          '--disable-accelerated-jpeg-decoding',
          '--disable-accelerated-mjpeg-decode',
          '--disable-accelerated-video-decode',
        ]
        : []),
    ],
    env: (() => {
      const environment: Record<string, string> = {
        ...process.env as Record<string, string>,
        ...world.launchEnvOverrides,
        NODE_ENV: 'test',
        TIDGI_TEST_SCENARIO: world.scenarioSlug,
        E2E_TEST: 'true',
        LANG: process.env.LANG || 'zh-Hans.UTF-8',
        LANGUAGE: process.env.LANGUAGE || 'zh-Hans:zh',
        LC_ALL: process.env.LC_ALL || 'zh-Hans.UTF-8',
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
        ...(process.env.CI && {
          ELECTRON_ENABLE_LOGGING: 'true',
          ELECTRON_DISABLE_HARDWARE_ACCELERATION: 'true',
        }),
      };
      // When ELECTRON_RUN_AS_NODE is set, Electron runs in Node mode instead of GUI mode.
      // Unit tests set this for vitest, but E2E tests need Electron to launch as a GUI app.
      // Delete it from the child process env so Playwright can find the browser window.
      delete environment.ELECTRON_RUN_AS_NODE;
      return environment;
    })(),
    cwd: process.cwd(),
    timeout: CUCUMBER_GLOBAL_TIMEOUT,
  });

  world.app = app;
  // Record the PID so cleanup can hard-kill the specific process if graceful close fails.
  world.appPid = app.process().pid;

  // Do not block launch step on firstWindow; this can exceed Cucumber's 5s step timeout.
  // Window acquisition is handled in "I wait for the page to load completely".
  const openedWindows = app.windows().filter(page => !page.isClosed());
  world.mainWindow = openedWindows[0];
  world.currentWindow = world.mainWindow;

  // Attach pageerror/console listeners to all renderer pages so we can capture React errors.
  const trackedPages = new Set<string>();
  const attachListeners = (page: import('playwright').Page) => {
    const key = page.url();
    if (trackedPages.has(key)) return;
    trackedPages.add(key);
    page.on('pageerror', (error: Error) => {
      console.error(`[RENDERER ERROR @ ${key}] ${error.name}: ${error.message}\n${error.stack ?? ''}`);
    });
    page.on('console', (message) => {
      if (message.type() === 'error') {
        console.error(`[RENDERER CONSOLE ERROR @ ${key}] ${message.text()}`);
      }
    });
  };
  for (const page of openedWindows) attachListeners(page);
  const windowTracker = setInterval(() => {
    if (!world.app) {
      clearInterval(windowTracker);
      return;
    }
    for (const page of world.app.windows().filter(p => !p.isClosed())) {
      attachListeners(page);
    }
  }, 500);
  // Stop tracking after 2 minutes (test duration upper bound)
  setTimeout(() => {
    clearInterval(windowTracker);
  }, 120_000);

  // Suppress "No dialog is showing" unhandled rejections from Playwright's
  // DialogManager. Playwright auto-closes dialogs via CDP but doesn't catch
  // the rejection when the dialog already closed (race condition). The
  // unhandled rejection then propagates to whatever Playwright action was running.
  const processWithDialogFlag = process as NodeJS.Process & { __dialogRejectionHandlerInstalled?: boolean };
  if (!processWithDialogFlag.__dialogRejectionHandlerInstalled) {
    process.on('unhandledRejection', (reason: unknown) => {
      if (reason instanceof Error && reason.message.includes('handleJavaScriptDialog')) {
        // Swallow — this is a known Playwright race condition
        return;
      }
      // For other rejections, let them propagate normally
    });
    processWithDialogFlag.__dialogRejectionHandlerInstalled = true;
  }
}

Given('I mock system palette as {string}', function(this: ApplicationWorld, palette: string) {
  if (palette !== 'dark' && palette !== 'light') {
    throw new Error(`Unsupported palette mock value: ${palette}. Use "dark" or "light".`);
  }
  this.launchEnvOverrides.TIDGI_E2E_MOCK_SYSTEM_PALETTE = palette;
});

async function closeTidGiApplication(world: ApplicationWorld): Promise<void> {
  // If launch is still in progress, wait it settle before closing.
  if (world.appLaunchPromise) {
    try {
      await world.appLaunchPromise;
    } catch {
      // Ignore launch failure here; close path will clear world state.
    }
  }

  if (!world.app) return;

  try {
    await Promise.race([
      world.app.close(),
      new Promise((_, reject) =>
        setTimeout(() => {
          reject(new Error('close timeout'));
        }, 4000)
      ),
    ]);
  } catch {
    // context().close() removed — same reason as cleanup.ts After hook:
    // Playwright context() communicates via CDP pipe synchronously and hangs
    // indefinitely when the Electron process is already dead/taskkill'd.
    // Promise.race timeout cannot rescue this.
  } finally {
    // Hard-kill fallback: if the process is still alive, force terminate it via PID
    // to prevent zombie processes from accumulating across scenarios.
    if (world.appPid !== undefined) {
      try {
        const { execSync } = await import('child_process');
        if (process.platform === 'win32') {
          execSync(`taskkill /PID ${world.appPid} /T /F`, { stdio: 'ignore' });
        } else {
          process.kill(world.appPid, 'SIGKILL');
        }
      } catch {
        // Process already exited or kill failed — ignore
      }
      world.appPid = undefined;
    }
    world.appLaunchPromise = undefined;
    world.app = undefined;
    world.mainWindow = undefined;
    world.currentWindow = undefined;
  }
}

AfterStep({ timeout: 3000 }, async function(this: ApplicationWorld, { pickle, pickleStep, result }) {
  if (!this.app) return;

  // Only capture screenshots for failed steps to avoid ~200-500ms IPC overhead per step.
  // With 1400+ steps, capturing every step adds 4-10 minutes to CI.
  if (result?.status !== Status.FAILED) return;

  try {
    const stepText = pickleStep.text;
    const scenarioName = pickle.name;
    const cleanScenarioName = makeSlugPath(scenarioName, 60);
    const cleanStepText = makeSlugPath(stepText, 80);

    const scenarioScreenshotsDirectory = path.resolve(process.cwd(), 'test-artifacts', cleanScenarioName, 'userData-test', 'logs', 'screenshots');
    await fs.ensureDir(scenarioScreenshotsDirectory);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = path.resolve(scenarioScreenshotsDirectory, `${timestamp}-${cleanStepText}-FAILED.png`);

    // Steps operating on BrowserView (WebContentsView) → capture the embedded wiki view
    // Other steps (main window UI, editWorkspace, preferences, etc.) → capture the current window page
    const isBrowserViewStep = /browser view|TiddlyWiki code/i.test(stepText);
    if (isBrowserViewStep) {
      await captureScreenshot(this.app, screenshotPath);
    } else if (this.currentWindow && !this.currentWindow.isClosed()) {
      await captureWindowScreenshot(this.app, this.currentWindow, screenshotPath);
    }
  } catch (error) {
    // Screenshot is best-effort diagnostics, never fail a step for it
    console.warn('[AfterStep screenshot]', error instanceof Error ? error.message : String(error));
  }
});

// CRITICAL WARNING FOR ALL AI AGENTS:
// DO NOT MODIFY TIMEOUT VALUES! NEVER!
// If a test times out, it means there is a REAL BUG to fix, not a timeout to increase.
// Timeout is a symptom, not the disease. Fix the root cause.
// Read docs/Testing.md section "Key E2E Testing Patterns" point 6 before attempting any changes.
// Maximum allowed timeouts: Local 5s, CI 10s (exactly 2x local, no more)
When('I launch the TidGi application', async function(this: ApplicationWorld) {
  this.appLaunchPromise = launchTidGiApplication(this).catch((error: unknown) => {
    throw error;
  });
  await this.appLaunchPromise;
});

When('I close the TidGi application', async function(this: ApplicationWorld) {
  try {
    await closeTidGiApplication(this);
  } catch (error) {
    throw new Error(`Failed to close TidGi application: ${error as Error}`);
  }
});

When('I prepare to select directory in dialog {string}', async function(this: ApplicationWorld, directoryName: string) {
  if (!this.app) {
    throw new Error('Application is not launched');
  }
  // Use scenario-specific path for isolation
  const targetPath = path.resolve(process.cwd(), 'test-artifacts', this.scenarioSlug, directoryName);
  // Ensure parent directory exists (but do NOT remove target directory - it may be an existing wiki we want to import)
  await fs.ensureDir(path.dirname(targetPath));
  // Setup one-time dialog handler that restores after use
  await this.app.evaluate(({ dialog }, targetDirectory: string) => {
    // Save original function with proper binding
    const originalShowOpenDialog = dialog.showOpenDialog.bind(dialog);
    // Override with one-time mock
    dialog.showOpenDialog = async () => {
      // Restore original immediately after first call
      dialog.showOpenDialog = originalShowOpenDialog;
      return {
        canceled: false,
        filePaths: [targetDirectory],
      };
    };
  }, targetPath);
});

When('I prepare to select file {string} for file chooser', async function(this: ApplicationWorld, filePath: string) {
  const page = this.currentWindow;
  if (!page) {
    throw new Error('No current window available');
  }
  const targetPath = path.resolve(process.cwd(), filePath);
  if (!await fs.pathExists(targetPath)) {
    throw new Error(`File does not exist: ${targetPath}`);
  }
  // Register a one-shot Playwright filechooser intercept BEFORE the click that
  // triggers the file input. This prevents the native OS dialog from appearing
  // and directly resolves the chooser with the supplied file.
  page.once('filechooser', async (fileChooser) => {
    await fileChooser.setFiles(targetPath);
  });
});

When('I set file {string} to file input with selector {string}', async function(this: ApplicationWorld, filePath: string, selector: string) {
  const page = this.currentWindow;
  if (!page) {
    throw new Error('No current window available');
  }

  // Resolve the file path relative to project root
  const targetPath = path.resolve(process.cwd(), filePath);

  // Verify the file exists
  if (!await fs.pathExists(targetPath)) {
    throw new Error(`File does not exist: ${targetPath}`);
  }

  // Use Playwright's setInputFiles to directly set file to the input element
  // This works even for hidden inputs
  await page.locator(selector).setInputFiles(targetPath);
});

/**
 * Hide the main window exactly as `runOnBackground` does when the user presses the close button.
 * Directly hides the Electron BrowserWindow in the main process without going through the
 * renderer IPC proxy (since `hide` is intentionally not exposed to the renderer).
 */
When('I hide the main window as if closing with runOnBackground', async function(this: ApplicationWorld) {
  if (!this.app) throw new Error('Application is not launched');
  await this.app.evaluate(({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows();
    // The main window is identified by its index.html URL
    const mainWindow = windows.find(win => !win.isDestroyed() && win.webContents?.getURL().includes('index.html'));
    if (!mainWindow) throw new Error('Main window not found for hide');
    mainWindow.hide();
  });
  // Allow the hide and event loop to settle before continuing.
  await this.app.evaluate(async () => new Promise<void>(resolve => setTimeout(resolve, 300)));
});

/**
 * Reopen the main window the same way a second-instance launch triggers it.
 * Emits the Electron `second-instance` app event directly in the main process, which
 * calls `windowService.open(WindowNames.main)` → `existedWindow.show()` → 'show' event
 * → `refreshActiveWorkspaceView()`.
 */
When('I reopen the main window as second instance would', async function(this: ApplicationWorld) {
  if (!this.app) throw new Error('Application is not launched');
  await this.app.evaluate(({ app, BrowserWindow }) => {
    // Trigger the same handler that a real second-instance launch fires.
    // Electron event listeners for 'second-instance' receive: (event, argv, workingDirectory, additionalData).
    // We must pass a fake Event object first so that DeepLinkService's `(_event, commandLine)` handler
    // receives an empty array as commandLine, not our workingDirectory string.
    app.emit('second-instance', /* event */ {}, /* argv */ [], /* workingDirectory */ '', /* additionalData */ {});
    // In test mode, window.open() intentionally skips existedWindow.show() to avoid UI popups.
    // Show all surviving windows explicitly so the recreated main window is guaranteed visible.
    // This avoids brittle heuristics that try to distinguish main vs tidgi mini window by size.
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.show();
      }
    }
  });
  // Wait for show → refreshActiveWorkspaceView → buildMenu to complete.
  await this.app.evaluate(async () => new Promise<void>(resolve => setTimeout(resolve, 500)));
});

When('I trigger deep link {string} as second instance would', async function(this: ApplicationWorld, deepLink: string) {
  if (!this.app) throw new Error('Application is not launched');
  await this.app.evaluate(({ app, BrowserWindow }, url: string) => {
    app.emit('second-instance', /* event */ {}, /* argv */ [url], /* workingDirectory */ '', /* additionalData */ {});
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.show();
      }
    }
  }, deepLink);
  await this.app.evaluate(async () => new Promise<void>(resolve => setTimeout(resolve, 500)));
});
