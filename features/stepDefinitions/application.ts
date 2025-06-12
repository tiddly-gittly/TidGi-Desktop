import { After, AfterStep, Before, setWorldConstructor, Then, When } from '@cucumber/cucumber';
import { _electron as electron } from 'playwright';
import type { ElectronApplication, Page } from 'playwright';
import { getPackedAppPath } from '../supports/paths';

class ApplicationWorld {
  app: ElectronApplication | undefined;
  mainWindow: Page | undefined;
}

setWorldConstructor(ApplicationWorld);

Before(async function(this: ApplicationWorld) {
  console.log('Starting test scenario');

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
      console.log('Application closed successfully');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
    this.app = undefined;
    this.mainWindow = undefined;
  }
});

AfterStep(async function(this: ApplicationWorld, { pickleStep }) {
  // Take screenshot after each step
  if (this.mainWindow) {
    try {
      // Extract step text and clean it for filename
      const stepText = pickleStep.text || 'unknown-step';
      const cleanStepText = stepText
        .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
        .substring(0, 100);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const screenshotPath = `logs/screenshots/${timestamp}-${cleanStepText}.png`;
      await this.mainWindow.screenshot({ path: screenshotPath, fullPage: true, quality: 10, type: 'jpeg', scale: 'css', caret: 'initial' });
      console.log(`Screenshot saved to: ${screenshotPath}`);
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
        // macOS CI specific arguments
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
        // Additional CI flags
        '--disable-extensions',
        '--disable-plugins',
        '--disable-default-apps',
        '--virtual-time-budget=1000',
        '--run-all-compositor-stages-before-draw',
        '--disable-checker-imaging',
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
  } catch (error) {
    throw new Error(
      `Failed to launch TidGi application: ${error as Error}. You should run \`pnpm run package\` before running the tests to ensure the app is built, and build with binaries like "dugite" and "tiddlywiki", see scripts/afterPack.js for more details.`,
    );
  }
});

When('I wait for {int} seconds', async function(seconds: number) {
  await new Promise(resolve => setTimeout(resolve, seconds * 1000));
});

When('I wait for the page to load completely', async function(this: ApplicationWorld) {
  await this.mainWindow?.waitForLoadState('networkidle', { timeout: 30000 });
});

Then('I should see an element with selector {string}', async function(this: ApplicationWorld, selector: string) {
  try {
    await this.mainWindow?.waitForSelector(selector, { timeout: 10000 });
    const isVisible = await this.mainWindow?.isVisible(selector);
    if (!isVisible) {
      throw new Error(`Element with selector "${selector}" is not visible`);
    }
  } catch (error) {
    throw new Error(`Failed to find visible element with selector "${selector}": ${error as Error}`);
  }
});

Then('I should {word} see text {string}', async function(this: ApplicationWorld, modifier: string, text: string) {
  switch (modifier) {
    case 'always':
    case '': {
      // For "I should see text" - wait for text to appear
      try {
        await this.mainWindow?.waitForFunction(
          (searchText) => document.body.textContent?.includes(searchText),
          text,
          { timeout: 10000 },
        );
      } catch (error) {
        throw new Error(`Failed to find text "${text}" on the page: ${error as Error}`);
      }
      break;
    }
    case 'not': {
      // For "I should not see text" - check text is not present
      const bodyContent = await this.mainWindow?.textContent('body');
      if (bodyContent?.includes(text)) {
        throw new Error(`Text "${text}" should not be visible but was found on the page`);
      }
      break;
    }
    default:
      throw new Error(`Unsupported text modifier: "${modifier}". Use "not" or leave empty`);
  }
});

Then('I should see text {string}', async function(this: ApplicationWorld, text: string) {
  try {
    // Wait for the text to appear on the page
    await this.mainWindow?.waitForFunction(
      (searchText) => document.body.textContent?.includes(searchText),
      text,
      { timeout: 10000 },
    );
  } catch (error) {
    throw new Error(`Failed to find text "${text}" on the page: ${error as Error}`);
  }
});

Then('the window title should {word} {string}', async function(this: ApplicationWorld, action: string, value: string) {
  const actualTitle = await this.mainWindow?.title();

  switch (action) {
    case 'contain':
      if (!actualTitle?.includes(value)) {
        throw new Error(`Expected window title to contain "${value}" but got "${actualTitle}"`);
      }
      console.log(`✓ Window title contains "${value}"`);
      break;
    case 'equal':
    case 'be':
      if (actualTitle !== value) {
        throw new Error(`Expected window title to be "${value}" but got "${actualTitle}"`);
      }
      console.log(`✓ Window title is "${value}"`);
      break;
    default:
      throw new Error(`Unsupported title action: "${action}". Use "contain", "equal", or "be"`);
  }
});
