import { AfterStep, setWorldConstructor, When } from '@cucumber/cucumber';
import { backOff } from 'exponential-backoff';
import fs from 'fs-extra';
import path from 'path';
import { _electron as electron } from 'playwright';
import type { ElectronApplication, Page } from 'playwright';
import { windowDimension, WindowNames } from '../../src/services/windows/WindowProperties';
import { MockOAuthServer } from '../supports/mockOAuthServer';
import { MockOpenAIServer } from '../supports/mockOpenAI';
import { getPackedAppPath, makeSlugPath } from '../supports/paths';
import { PLAYWRIGHT_TIMEOUT } from '../supports/timeouts';
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

// Helper function to get window dimensions and ensure they are valid
export function checkWindowDimension(windowName: WindowNames): { width: number; height: number } {
  const targetDimensions = windowDimension[windowName];
  if (!targetDimensions.width || !targetDimensions.height) {
    throw new Error(`Window "${windowName}" does not have valid dimensions defined in windowDimension`);
  }
  return targetDimensions as { width: number; height: number };
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
  providerConfig: import('@services/externalAPI/interface').AIProviderConfig | undefined; // Scenario-specific AI provider config

  // Helper method to check if window is visible
  async isWindowVisible(page: Page): Promise<boolean> {
    if (!this.app) return false;
    try {
      const browserWindow = await this.app.browserWindow(page);
      return await browserWindow.evaluate((win: Electron.BrowserWindow) => win.isVisible());
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
      if (allWindows.length > 0) {
        // Return the first window (main window is always the first one created)
        return allWindows[0];
      }
      return undefined;
    } else if (windowName === WindowNames.tidgiMiniWindow) {
      // Special handling for tidgi mini window
      // First try to find by Electron window dimensions (more reliable than title)
      const windowDimensions = checkWindowDimension(windowName);
      try {
        const electronWindowInfo = await this.app.evaluate(
          async ({ BrowserWindow }, size: { width: number; height: number }) => {
            const allWindows = BrowserWindow.getAllWindows();
            const tidgiMiniWindow = allWindows.find(win => {
              const bounds = win.getBounds();
              return bounds.width === size.width && bounds.height === size.height;
            });
            return tidgiMiniWindow ? { id: tidgiMiniWindow.id } : null;
          },
          windowDimensions,
        );

        if (electronWindowInfo) {
          // Found by dimensions, now match with Playwright page
          const allWindows = pages.filter(page => !page.isClosed());
          for (const page of allWindows) {
            try {
              // Try to match by checking if this page belongs to the found electron window
              // For now, use title as fallback verification
              const title = await page.title();
              if (title.includes('太记小窗') || title.includes('TidGi Mini Window') || title.includes('TidGiMiniWindow')) {
                return page;
              }
            } catch {
              continue;
            }
          }
        }
      } catch {
        // If Electron API fails, fallback to title matching
      }

      // Fallback: Match by window title
      const allWindows = pages.filter(page => !page.isClosed());
      for (const page of allWindows) {
        try {
          const title = await page.title();
          if (title.includes('太记小窗') || title.includes('TidGi Mini Window') || title.includes('TidGiMiniWindow')) {
            return page;
          }
        } catch {
          // Page might be closed or not ready, continue to next
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

  world.app = await electron.launch({
    executablePath: packedAppPath,
    args: [
      `--test-scenario=${world.scenarioSlug}`,
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
    env: {
      ...process.env,
      NODE_ENV: 'test',
      E2E_TEST: 'true',
      LANG: process.env.LANG || 'zh-Hans.UTF-8',
      LANGUAGE: process.env.LANGUAGE || 'zh-Hans:zh',
      LC_ALL: process.env.LC_ALL || 'zh-Hans.UTF-8',
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ...(process.env.CI && {
        ELECTRON_ENABLE_LOGGING: 'true',
        ELECTRON_DISABLE_HARDWARE_ACCELERATION: 'true',
      }),
    },
    cwd: process.cwd(),
    timeout: PLAYWRIGHT_TIMEOUT,
  });

  // Do not block launch step on firstWindow; this can exceed Cucumber's 5s step timeout.
  // Window acquisition is handled in "I wait for the page to load completely".
  const openedWindows = world.app.windows().filter(page => !page.isClosed());
  world.mainWindow = openedWindows[0];
  world.currentWindow = world.mainWindow;
}

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
    try {
      await Promise.race([
        world.app.context().close({ reason: 'Relaunch application in scenario' }),
        new Promise(resolve => setTimeout(resolve, 500)),
      ]);
    } catch {
      // ignore
    }
  } finally {
    world.appLaunchPromise = undefined;
    world.app = undefined;
    world.mainWindow = undefined;
    world.currentWindow = undefined;
  }
}

AfterStep({ timeout: 3000 }, async function(this: ApplicationWorld, { pickle, pickleStep, result }) {
  if (!this.app) return;

  try {
    const stepText = pickleStep.text;

    // Skip screenshots for steps that don't interact with the UI
    if (stepText.match(/^I wait for|^I clear log|^I create file |^I sync |^I clone |^file "/i)) {
      return;
    }

    const scenarioName = pickle.name;
    const cleanScenarioName = makeSlugPath(scenarioName, 60);
    const cleanStepText = makeSlugPath(stepText, 80);
    const stepStatus = result && typeof result.status === 'string' ? result.status : 'unknown-status';

    const scenarioScreenshotsDirectory = path.resolve(process.cwd(), 'test-artifacts', cleanScenarioName, 'userData-test', 'logs', 'screenshots');
    await fs.ensureDir(scenarioScreenshotsDirectory);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = path.resolve(scenarioScreenshotsDirectory, `${timestamp}-${cleanStepText}-${stepStatus}.png`);

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
