import { After, Before, setWorldConstructor, Then, When } from '@cucumber/cucumber';
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
        '--disable-ipc-flooding-protection'
      ],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        // Force headless mode in CI
        DISPLAY: process.env.CI ? ':99' : (process.env.DISPLAY || ':0'),
      },
    });
    this.mainWindow = await this.app.firstWindow();
  } catch (error) {
    throw new Error(`Failed to launch TidGi application: ${error as Error}. You should run \`pnpm run package:dev\` before running the tests to ensure the app is built.`);
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
