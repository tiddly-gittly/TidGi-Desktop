import { After, AfterStep, Before, setWorldConstructor, Then, When } from '@cucumber/cucumber';
import { _electron as electron } from 'playwright';
import type { ElectronApplication, Page } from 'playwright';
import { isMainWindowPage, PageType } from '../../src/constants/pageTypes';
import { MockOpenAIServer } from '../supports/mockOpenAI';
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

      if (windowType === 'main') {
        const mainWindow = pages.find(page => {
          const pageType = page.url().split('#/').pop();
          // file:///C:/Users/linonetwo/Documents/repo-c/TidGi-Desktop/out/TidGi-win32-x64/resources/app.asar/.webpack/renderer/main_window/index.html#/guide
          return isMainWindowPage(pageType as PageType | undefined);
        });
        if (mainWindow) return mainWindow;
      } else if (windowType === 'current') {
        if (this.currentWindow) return this.currentWindow;
      } else {
        // file:///C:/Users/linonetwo/Documents/repo-c/TidGi-Desktop/out/TidGi-win32-x64/resources/app.asar/.webpack/renderer/main_window/index.html#/preferences
        const specificWindow = pages.find(page => {
          const pageType = page.url().split('#/').pop();
          return pageType === windowType;
        });
        if (specificWindow) return specificWindow;
      }

      // If window not found, wait 1 second and retry (except for the last attempt)
      if (attempt < 2) {
        console.log(`Window "${windowType}" not found, waiting 1 second before retry ${attempt + 1}/3...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`Window "${windowType}" not found after 3 attempts`);
    return undefined;
  }
}

setWorldConstructor(ApplicationWorld);

Before(async function(this: ApplicationWorld) {
  // Create necessary directories
  const fs = await import('fs');
  if (!fs.existsSync('logs')) {
    fs.mkdirSync('logs', { recursive: true });
  }
  // Create screenshots subdirectory in logs
  if (!fs.existsSync('logs/screenshots')) {
    fs.mkdirSync('logs/screenshots', { recursive: true });
  }
});

After(async function(this: ApplicationWorld) {
  if (this.app) {
    try {
      await this.app.close();
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
    this.app = undefined;
    this.mainWindow = undefined;
    this.currentWindow = undefined;
  }
});

AfterStep(async function(this: ApplicationWorld, { pickleStep }) {
  // Only take screenshots in CI environment
  if (process.env.CI && this.currentWindow) {
    try {
      // Extract step text and clean it for filename
      const stepText = pickleStep.text || 'unknown-step';
      const cleanStepText = stepText
        .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
        .substring(0, 100);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const screenshotPath = `logs/screenshots/${timestamp}-${cleanStepText}.png`;
      await this.currentWindow.screenshot({ path: screenshotPath, fullPage: true, quality: 10, type: 'jpeg', scale: 'css', caret: 'initial' });
    } catch (screenshotError) {
      console.warn('Failed to take screenshot:', screenshotError);
    }
  }
});

When('I launch the TidGi application', async function(this: ApplicationWorld) {
  // For E2E tests on dev mode, use the packaged test version with NODE_ENV environment variable baked in
  const packedAppPath = getPackedAppPath();
  console.log('Launching packaged test app at:', packedAppPath);

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
        // Force display settings for CI
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
        ...(process.env.CI && {
          ELECTRON_ENABLE_LOGGING: 'true',
          ELECTRON_DISABLE_HARDWARE_ACCELERATION: 'true',
        }),
      },
      timeout: 60000, // Increase timeout to 60 seconds for CI
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

When('I wait for {float} seconds', async function(seconds: number) {
  await new Promise(resolve => setTimeout(resolve, seconds * 1000));
});

When('I wait for the page to load completely', async function(this: ApplicationWorld) {
  const currentWindow = this.currentWindow || this.mainWindow;
  await currentWindow?.waitForLoadState('networkidle', { timeout: 30000 });
});

Then('I should see a(n) {string} element with selector {string}', async function(this: ApplicationWorld, elementComment: string, selector: string) {
  const currentWindow = this.currentWindow || this.mainWindow;
  try {
    await currentWindow?.waitForSelector(selector, { timeout: 10000 });
    const isVisible = await currentWindow?.isVisible(selector);
    if (!isVisible) {
      throw new Error(`Element "${elementComment}" with selector "${selector}" is not visible`);
    }
  } catch (error) {
    throw new Error(`Failed to find ${elementComment} with selector "${selector}": ${error as Error}`);
  }
});

When('I click on a(n) {string} element with selector {string}', async function(this: ApplicationWorld, elementComment: string, selector: string) {
  const targetWindow = await this.getWindow('current');

  if (!targetWindow) {
    throw new Error(`Window "current" is not available`);
  }

  try {
    await targetWindow.waitForSelector(selector, { timeout: 10000 });
    const isVisible = await targetWindow.isVisible(selector);
    if (!isVisible) {
      throw new Error(`Element "${elementComment}" with selector "${selector}" is not visible`);
    }
    await targetWindow.click(selector);
  } catch (error) {
    throw new Error(`Failed to find and click ${elementComment} with selector "${selector}" in current window: ${error as Error}`);
  }
});

When('I type {string} in {string} element with selector {string}', async function(this: ApplicationWorld, text: string, elementComment: string, selector: string) {
  const currentWindow = this.currentWindow || this.mainWindow;
  if (!currentWindow) {
    throw new Error('No current window is available');
  }

  try {
    await currentWindow.waitForSelector(selector, { timeout: 10000 });
    const element = currentWindow.locator(selector);

    // Handle mock server URL special case
    if (text === 'MOCK_SERVER_URL' && this.mockOpenAIServer) {
      await element.click();
      await element.selectText();
      await element.fill(this.mockOpenAIServer.baseUrl + '/v1');
    } else {
      await element.fill(text);
    }
  } catch (error) {
    throw new Error(`Failed to type in ${elementComment} element with selector "${selector}": ${error as Error}`);
  }
});

// Minimal text checking for smoke test
When('I should not see text {string}', async function(this: ApplicationWorld, text: string) {
  const currentWindow = this.currentWindow || this.mainWindow;
  if (!currentWindow) {
    throw new Error('No current window is available');
  }

  const bodyContent = await currentWindow.textContent('body');
  if (bodyContent?.includes(text)) {
    throw new Error(`Text "${text}" should not be visible but was found on the page`);
  }
});

When('the window title should contain {string}', async function(this: ApplicationWorld, expectedTitle: string) {
  const currentWindow = this.currentWindow || this.mainWindow;
  if (!currentWindow) {
    throw new Error('No current window is available');
  }

  try {
    const title = await currentWindow.title();
    if (!title.includes(expectedTitle)) {
      throw new Error(`Window title "${title}" does not contain "${expectedTitle}"`);
    }
  } catch (error) {
    throw new Error(`Failed to check window title: ${error as Error}`);
  }
});

// Generic keyboard action
When('I press {string} key', async function(this: ApplicationWorld, key: string) {
  const currentWindow = this.currentWindow || this.mainWindow;
  if (!currentWindow) {
    throw new Error('No current window is available');
  }

  await currentWindow.keyboard.press(key);
});

// Generic window switching - sets currentWindow state for subsequent operations
// You may need to wait a second before switch, otherwise window's URL may not set yet.
When('I switch to {string} window', async function(this: ApplicationWorld, windowType: string) {
  if (!this.app) {
    throw new Error('Application is not available');
  }
  const targetWindow = await this.getWindow(windowType);
  if (targetWindow) {
    this.currentWindow = targetWindow; // Set currentWindow state
  } else {
    throw new Error(`Could not find ${windowType} window`);
  }
});

// Generic window closing
When('I close {string} window', async function(this: ApplicationWorld, windowType: string) {
  if (!this.app) {
    throw new Error('Application is not available');
  }
  const targetWindow = await this.getWindow(windowType);
  if (targetWindow) {
    await targetWindow.close();
  } else {
    throw new Error(`Could not find ${windowType} window to close`);
  }
});
