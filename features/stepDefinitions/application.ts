import { AfterStep, setDefaultTimeout, setWorldConstructor, When } from '@cucumber/cucumber';
import { backOff } from 'exponential-backoff';
import fs from 'fs-extra';
import path from 'path';
import { _electron as electron } from 'playwright';
import type { ElectronApplication, Page } from 'playwright';
import { windowDimension, WindowNames } from '../../src/services/windows/WindowProperties';
import { MockOAuthServer } from '../supports/mockOAuthServer';
import { MockOpenAIServer } from '../supports/mockOpenAI';
import { makeSlugPath, screenshotsDirectory } from '../supports/paths';
import { getPackedAppPath } from '../supports/paths';
import { captureScreenshot } from '../supports/webContentsViewHelper';

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
  mainWindow: Page | undefined; // Keep for compatibility during transition
  currentWindow: Page | undefined; // New state-managed current window
  mockOpenAIServer: MockOpenAIServer | undefined;
  mockOAuthServer: MockOAuthServer | undefined;

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

if (process.env.CI) {
  setDefaultTimeout(50000);
}

AfterStep(async function(this: ApplicationWorld, { pickle, pickleStep, result }) {
  // Only take screenshots in CI environment
  // if (!process.env.CI) return;

  try {
    const stepText = pickleStep.text;

    // Skip screenshots for wait steps to avoid too many screenshots
    if (stepText.match(/^I wait for \d+(\.\d+)? seconds?$/i)) {
      return;
    }

    // Prefer an existing currentWindow if it's still open
    let pageToUse: Page | undefined;

    if (this.currentWindow && !this.currentWindow.isClosed()) {
      pageToUse = this.currentWindow;
    }

    // If currentWindow is not available, try to re-acquire any open window from the app
    if ((!pageToUse || pageToUse.isClosed()) && this.app) {
      const openPages = this.app.windows().filter(p => !p.isClosed());
      if (openPages.length > 0) {
        pageToUse = openPages[0];
      }
    }

  const scenarioName = pickle.name;
  // Limit scenario slug to avoid extremely long directory names
  const cleanScenarioName = makeSlugPath(scenarioName, 60);

  // Limit step text slug to avoid excessively long filenames which can trigger ENAMETOOLONG
  const cleanStepText = makeSlugPath(stepText, 80);
    const stepStatus = result && typeof result.status === 'string' ? result.status : 'unknown-status';

    const featureDirectory = path.resolve(screenshotsDirectory, cleanScenarioName);
    // Create directory asynchronously to avoid blocking the event loop in CI
    await fs.ensureDir(featureDirectory);

    // Sometimes window close and don't wait for use to take picture, or window haven't open in this step, never mind, just skip.
    /**
     * Typical steps like:
     * - I add test ai settings
     * - I cleanup test wiki so it could create a new one on start
     * - I clear test ai settings
     */
    if (!pageToUse || pageToUse.isClosed()) {
      // console.warn(`Skipping screenshot: ${cleanStepText}`);
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Try to capture both WebContentsView and Page screenshots
    let webViewCaptured = false;
    if (this.app) {
      const webViewScreenshotPath = path.resolve(featureDirectory, `${timestamp}-${cleanStepText}-${stepStatus}-webview.png`);
      webViewCaptured = await captureScreenshot(this.app, webViewScreenshotPath);
    }

    // Always capture page screenshot (UI chrome/window)
    const pageScreenshotPath = path.resolve(featureDirectory, `${timestamp}-${cleanStepText}-${stepStatus}${webViewCaptured ? '-page' : ''}.png`);
    await pageToUse.screenshot({ path: pageScreenshotPath, fullPage: true, type: 'png' });
  } catch (screenshotError) {
    console.warn('Failed to take screenshot:', screenshotError);
  }
});

When('I launch the TidGi application', async function(this: ApplicationWorld) {
  // For E2E tests on dev mode, use the packaged test version with NODE_ENV environment variable baked in
  const packedAppPath = getPackedAppPath();

  try {
    this.app = await electron.launch({
      executablePath: packedAppPath,
      // Add debugging options to prevent app from closing and CI-specific args
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
        // Linux CI specific arguments
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
        // Ensure tests run in Chinese locale so i18n UI strings match expectations
        // set multiple variables for cross-platform coverage
        LANG: process.env.LANG || 'zh-Hans.UTF-8',
        LANGUAGE: process.env.LANGUAGE || 'zh-Hans:zh',
        LC_ALL: process.env.LC_ALL || 'zh-Hans.UTF-8',
        // Force display settings for CI
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
        ...(process.env.CI && {
          ELECTRON_ENABLE_LOGGING: 'true',
          ELECTRON_DISABLE_HARDWARE_ACCELERATION: 'true',
        }),
      },
      timeout: 30000, // Increase timeout to 30 seconds for CI
    });

    // Wait longer for window in CI environment
    const windowTimeout = process.env.CI ? 45000 : 10000;
    this.mainWindow = await this.app.firstWindow({ timeout: windowTimeout });
    this.currentWindow = this.mainWindow;
  } catch (error) {
    throw new Error(
      `Failed to launch TidGi application: ${error as Error}. You should run \`pnpm run test:prepare-e2e\` before running the tests to ensure the app is built, and build with binaries like "dugite" and "tiddlywiki", see scripts/afterPack.js for more details.`,
    );
  }
});
