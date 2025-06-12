import { After, Before, setDefaultTimeout, setWorldConstructor, Then, When } from '@cucumber/cucumber';
import { _electron as electron } from 'playwright';
import type { ElectronApplication, Page } from 'playwright';
import { getPackedAppPath } from '../supports/paths';

// Set timeout to 60 seconds for application launch
setDefaultTimeout(60 * 1000);

class ApplicationWorld {
  app: ElectronApplication | undefined;
  mainWindow: Page | undefined;
}

setWorldConstructor(ApplicationWorld);

Before(async function(this: ApplicationWorld) {
  console.log('Starting test scenario');
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

When('I launch the TidGi application', async function(this: ApplicationWorld) {
  const packedAppPath = getPackedAppPath();
  console.log('Launching packaged test app at:', packedAppPath);

  try {
    console.log('Starting electron.launch...');

    // Add file existence check
    const fs = await import('fs');
    if (!fs.existsSync(packedAppPath)) {
      throw new Error(`Executable not found at path: ${packedAppPath}. Please run 'pnpm run package' first.`);
    }
    
    console.log('Executable exists, checking permissions...');
    try {
      await fs.promises.access(packedAppPath, fs.constants.F_OK | fs.constants.X_OK);
      console.log('Executable is accessible and executable');
    } catch (permError) {
      console.warn('Permission check failed:', permError);
    }

    // Ensure DISPLAY is set correctly for CI
    const displayEnvironment = process.env.CI ? ':99' : (process.env.DISPLAY || ':0');
    console.log('Using DISPLAY:', displayEnvironment);

    this.app = await electron.launch({
      executablePath: packedAppPath,
      // CI environment specific args for headless testing
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
        '--disable-web-security',
        '--ignore-certificate-errors',
        '--allow-running-insecure-content',
        // Additional flags for CI stability
        '--disable-extensions',
        '--disable-plugins',
        '--disable-default-apps',
        '--disable-background-networking',
        '--disable-sync',
        '--metrics-recording-only',
        '--no-first-run',
      ],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DISPLAY: displayEnvironment,
        // Ensure other required env vars are set
        HOME: process.env.HOME || '/home/runner',
        TMPDIR: process.env.TMPDIR || '/tmp',
      },
      timeout: 60000, // 60 seconds timeout for app launch
    });
    console.log('Electron app launched, waiting for first window...');

    // Use explicit timeout for firstWindow with better error handling
    try {
      this.mainWindow = await this.app.firstWindow({ timeout: 90000 }); // Increase to 90 seconds
      console.log('Main window obtained successfully');
    } catch (windowError) {
      console.error('Failed to get first window:', windowError);
      
      // Try alternative approaches
      const pages = this.app.windows();
      if (pages.length > 0) {
        console.log(`Found ${pages.length} pages, using first page as main window`);
        this.mainWindow = pages[0];
      } else {
        console.log('No pages found, waiting for page event...');
        const context = this.app.context();
        await context.waitForEvent('page', { timeout: 30000 });
        this.mainWindow = await this.app.firstWindow({ timeout: 10000 });
      }
    }

    // Wait a bit for the window to be fully ready
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('Window ready for interaction');
  } catch (error) {
    console.error('Launch error details:', error);

    // Try to get more debug info if app was created
    if (this.app) {
      try {
        const pages = this.app.windows();
        console.log('Number of windows:', pages.length);

        // Get console logs from main process
        this.app.on('console', message => {
          console.log('Main process log:', message.text());
        });
      } catch (debugError) {
        console.error('Debug info error:', debugError);
      }
    }

    throw new Error(`Failed to launch TidGi application: ${error as Error}. You should run \`pnpm run package\` before running the tests to ensure the app is built.`);
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
