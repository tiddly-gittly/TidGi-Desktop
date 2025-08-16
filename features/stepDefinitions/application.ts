import { After, Before, setWorldConstructor, Then, When } from '@cucumber/cucumber';
import { _electron as electron } from 'playwright';
import type { ElectronApplication, Page } from 'playwright';
import { MockOpenAIServer } from '../supports/mockOpenAI';
import { getPackedAppPath } from '../supports/paths';

export class ApplicationWorld {
  app: ElectronApplication | undefined;
  mainWindow: Page | undefined; // Keep for compatibility during transition
  currentWindow: Page | undefined; // New state-managed current window
  mockOpenAIServer: MockOpenAIServer | undefined;

  getWindow(windowType: string = 'main'): Page | undefined {
    if (!this.app) return undefined;

    const pages = this.app.windows();
    switch (windowType) {
      case 'main':
        return pages[0]; // First window is usually main
      case 'preferences':
        return pages.length > 1 ? pages[1] : pages[0]; // Second window for preferences
      case 'current':
      default:
        return this.currentWindow || this.mainWindow; // Use currentWindow first, fallback to mainWindow
    }
  }
}

setWorldConstructor(ApplicationWorld);

Before(async function(this: ApplicationWorld) {
  console.log('Starting test scenario');

  // Start mock OpenAI server
  this.mockOpenAIServer = new MockOpenAIServer();
  await this.mockOpenAIServer.start();
  console.log(`Mock OpenAI server running at: ${this.mockOpenAIServer.baseUrl}`);

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
    this.currentWindow = undefined;
  }

  // Stop mock OpenAI server
  if (this.mockOpenAIServer) {
    await this.mockOpenAIServer.stop();
    this.mockOpenAIServer = undefined;
  }
});

// AfterStep(async function(this: ApplicationWorld, { pickleStep }) {
//   // Take screenshot after each step
//   if (this.mainWindow) {
//     try {
//       // Extract step text and clean it for filename
//       const stepText = pickleStep.text || 'unknown-step';
//       const cleanStepText = stepText
//         .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
//         .substring(0, 100);

//       const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
//       const screenshotPath = `logs/screenshots/${timestamp}-${cleanStepText}.png`;
//       await this.mainWindow.screenshot({ path: screenshotPath, fullPage: true, quality: 10, type: 'jpeg', scale: 'css', caret: 'initial' });
//       console.log(`Screenshot saved to: ${screenshotPath}`);
//     } catch (screenshotError) {
//       console.warn('Failed to take screenshot:', screenshotError);
//     }
//   }
// });

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
    this.currentWindow = this.mainWindow; // Initialize currentWindow
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
  const targetWindow = this.getWindow('current');

  if (!targetWindow) {
    throw new Error(`Window "current" is not available`);
  }

  try {
    console.log(`Trying to find element "${elementComment}" with selector: ${selector} in current window`);
    await targetWindow.waitForSelector(selector, { timeout: 10000 });
    const isVisible = await targetWindow.isVisible(selector);
    if (!isVisible) {
      throw new Error(`Element "${elementComment}" with selector "${selector}" is not visible`);
    }
    await targetWindow.click(selector);
    console.log(`✓ Clicked ${elementComment}: ${selector} in current window`);
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
      console.log(`✓ Set API address to: ${this.mockOpenAIServer.baseUrl}/v1`);
    } else {
      await element.fill(text);
      console.log(`✓ Typed "${text}" in ${elementComment} element: ${selector}`);
    }
  } catch (error) {
    throw new Error(`Failed to type in ${elementComment} element with selector "${selector}": ${error as Error}`);
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
    console.log(`✓ Window title contains "${expectedTitle}"`);
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
  console.log(`✓ Pressed ${key} key`);
});

// Generic window switching - sets currentWindow state for subsequent operations
When('I switch to {string} window', async function(this: ApplicationWorld, windowType: string) {
  if (!this.app) {
    throw new Error('Application is not available');
  }

  // Wait a bit for the window to potentially open
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Get all windows
  const pages = this.app.windows();
  console.log(`Found ${pages.length} windows after waiting`);
  
  const targetWindow = this.getWindow(windowType);
  if (targetWindow) {
    this.currentWindow = targetWindow; // Set currentWindow state
    console.log(`✓ Switched to ${windowType} window - currentWindow set`);
  } else {
    throw new Error(`Could not find ${windowType} window`);
  }
});

// Generic window closing
When('I close {string} window', async function(this: ApplicationWorld, windowType: string) {
  if (!this.app) {
    throw new Error('Application is not available');
  }

  const pages = this.app.windows();
  console.log(`Found ${pages.length} windows`);
  
  const targetWindow = this.getWindow(windowType);
  if (targetWindow) {
    await targetWindow.close();
    console.log(`✓ Closed ${windowType} window`);
    
    // Switch back to main window after closing
    const remainingWindows = this.app.windows();
    if (remainingWindows.length > 0) {
      this.mainWindow = remainingWindows[0];
      this.currentWindow = remainingWindows[0]; // Update currentWindow too
      console.log('✓ Switched back to main window');
    }
  } else {
    throw new Error(`Could not find ${windowType} window to close`);
  }
});
