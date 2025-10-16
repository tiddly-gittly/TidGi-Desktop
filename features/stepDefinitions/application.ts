import { After, AfterStep, Before, setWorldConstructor, When } from '@cucumber/cucumber';
import fs from 'fs-extra';
import path from 'path';
import { _electron as electron } from 'playwright';
import type { ElectronApplication, Page } from 'playwright';
import { isMainWindowPage, PageType } from '../../src/constants/pageTypes';
import { MockOpenAIServer } from '../supports/mockOpenAI';
import { logsDirectory, makeSlugPath, screenshotsDirectory } from '../supports/paths';
import { getPackedAppPath } from '../supports/paths';

export class ApplicationWorld {
  app: ElectronApplication | undefined;
  mainWindow: Page | undefined; // Keep for compatibility during transition
  currentWindow: Page | undefined; // New state-managed current window
  mockOpenAIServer: MockOpenAIServer | undefined;

  async getWindow(windowType: string = 'main'): Promise<Page | undefined> {
    if (!this.app) return undefined;

    for (let attempt = 0; attempt < 3; attempt++) {
      const pages = this.app.windows();

      const extractFragment = (url: string) => {
        if (!url) return '';
        const afterHash = url.includes('#') ? url.split('#').slice(1).join('#') : '';
        // remove leading slashes or colons like '/preferences' or ':Index'
        return afterHash.replace(/^[:/]+/, '').split(/[/?#]/)[0] || '';
      };

      if (windowType === 'main') {
        const mainWindow = pages.find(page => {
          const pageType = extractFragment(page.url());
          // file:///C:/Users/linonetwo/Documents/repo-c/TidGi-Desktop/out/TidGi-win32-x64/resources/app.asar/.webpack/renderer/main_window/index.html#/guide
          // file:///...#/guide or tidgi://.../#:Index based on different workspace
          return isMainWindowPage(pageType as PageType | undefined);
        });
        if (mainWindow) return mainWindow;
      } else if (windowType === 'current') {
        if (this.currentWindow) return this.currentWindow;
      } else {
        // match windows more flexibly by checking the full URL and fragment for the windowType
        const specificWindow = pages.find(page => {
          const rawUrl = page.url() || '';
          const frag = extractFragment(rawUrl);
          // Case-insensitive full-url match first (handles variants like '#:Index' or custom schemes)
          if (rawUrl.toLowerCase().includes(windowType.toLowerCase())) return true;
          // Fallback to fragment inclusion
          return frag.toLowerCase().includes(windowType.toLowerCase());
        });
        if (specificWindow) return specificWindow;
      }

      // If window not found, wait 1 second and retry (except for the last attempt)
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return undefined;
  }
}

setWorldConstructor(ApplicationWorld);

// setDefaultTimeout(50000);

Before(function(this: ApplicationWorld) {
  // Create necessary directories under userData-test/logs to match appPaths in dev/test
  if (!fs.existsSync(logsDirectory)) {
    fs.mkdirSync(logsDirectory, { recursive: true });
  }

  // Create screenshots subdirectory in logs
  if (!fs.existsSync(screenshotsDirectory)) {
    fs.mkdirSync(screenshotsDirectory, { recursive: true });
  }
});

After(async function(this: ApplicationWorld) {
  if (this.app) {
    try {
      // Close all windows including menubar window before closing the app, otherwise it might hang, and refused to exit until ctrl+C
      const allWindows = this.app.windows();
      for (const window of allWindows) {
        try {
          if (!window.isClosed()) {
            await window.close();
          }
        } catch (error) {
          console.error('Error closing window:', error);
        }
      }
      await this.app.close();
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
    this.app = undefined;
    this.mainWindow = undefined;
    this.currentWindow = undefined;
  }
});

AfterStep(async function(this: ApplicationWorld, { pickle, pickleStep, result }) {
  // Only take screenshots in CI environment
  // if (!process.env.CI) return;

  try {
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
        this.currentWindow = pageToUse;
      }
    }

    const scenarioName = pickle.name;
    const cleanScenarioName = makeSlugPath(scenarioName);

    const stepText = pickleStep.text;
    const cleanStepText = makeSlugPath(stepText, 120);
    const stepStatus = result && typeof result.status === 'string' ? result.status : 'unknown-status';

    const featureDirectory = path.resolve(screenshotsDirectory, cleanScenarioName);
    // Create directory asynchronously to avoid blocking the event loop in CI
    await fs.ensureDir(featureDirectory);

    // Sometimes window close and don't wait for use to take picture, or window haven't open in this step, never mind, just skip.
    /**
     * Typical steps like:
     * - I add test ai settings
     * - I cleanup test wiki
     * - I clear test ai settings
     */
    if (!pageToUse || pageToUse.isClosed()) {
      // console.warn(`Skipping screenshot: ${cleanStepText}`);
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = path.resolve(featureDirectory, `${timestamp}-${cleanStepText}-${stepStatus}.jpg`);

    // Use conservative screenshot options for CI
    await pageToUse.screenshot({ path: screenshotPath, fullPage: true, type: 'jpeg', quality: 10 });
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
      `Failed to launch TidGi application: ${error as Error}. You should run \`pnpm run package\` before running the tests to ensure the app is built, and build with binaries like "dugite" and "tiddlywiki", see scripts/afterPack.js for more details.`,
    );
  }
});

// Helper function to find window by type
async function findWindowByType(app: ElectronApplication, windowType: string): Promise<Page | undefined> {
  const pages = app.windows();

  if (windowType.toLowerCase() === 'menubar') {
    // Special handling for menubar window
    const allWindows = pages.filter(page => !page.isClosed());
    return allWindows.find(page => {
      const url = page.url() || '';
      return url.includes('#/menuBar');
    });
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

// Helper function to check if window is visible
async function isWindowVisible(app: ElectronApplication, page: Page): Promise<boolean> {
  try {
    const browserWindow = await app.browserWindow(page);
    return await browserWindow.evaluate((win: Electron.BrowserWindow) => win.isVisible());
  } catch {
    return false;
  }
}

// Helper function to wait for window with retry logic
async function waitForWindowCondition(
  app: ElectronApplication,
  windowType: string,
  condition: (window: Page | undefined, isVisible: boolean) => boolean,
  maxAttempts: number = 3,
  retryInterval: number = 250,
): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const targetWindow = await findWindowByType(app, windowType);
    const visible = targetWindow ? await isWindowVisible(app, targetWindow) : false;

    if (condition(targetWindow, visible)) {
      return true;
    }

    // Wait before retrying
    await new Promise(resolve => setTimeout(resolve, retryInterval));
  }
  return false;
}

When('I confirm the {string} window exists and visible', async function(this: ApplicationWorld, windowType: string) {
  if (!this.app) {
    throw new Error('Application is not launched');
  }

  const success = await waitForWindowCondition(
    this.app,
    windowType,
    (window, isVisible) => window !== undefined && !window.isClosed() && isVisible,
    3,
    100,
  );

  if (!success) {
    throw new Error(`${windowType} window was not found or is not visible`);
  }
  console.log(`${windowType} window confirmed to exist and be visible`);
});

When('I confirm the {string} window exists but not visible', async function(this: ApplicationWorld, windowType: string) {
  if (!this.app) {
    throw new Error('Application is not launched');
  }

  const success = await waitForWindowCondition(
    this.app,
    windowType,
    (window, isVisible) => window !== undefined && !window.isClosed() && !isVisible,
  );

  if (!success) {
    throw new Error(`${windowType} window does not exist or is visible after 3 attempts`);
  }
  console.log(`${windowType} window confirmed to exist but not be visible`);
});

When('I confirm the {string} window does not exist', async function(this: ApplicationWorld, windowType: string) {
  if (!this.app) {
    throw new Error('Application is not launched');
  }

  const success = await waitForWindowCondition(
    this.app,
    windowType,
    (window) => window === undefined,
    3,
    100,
  );

  if (!success) {
    throw new Error(`${windowType} window still exists after 3 attempts`);
  }
  console.log(`${windowType} window confirmed to not exist`);
});
