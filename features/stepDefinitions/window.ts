import { When } from '@cucumber/cucumber';
import type { ElectronApplication, Page } from 'playwright';
import type { ApplicationWorld } from './application';

// Constants for retry logic
const MAX_ATTEMPTS = 3;
const RETRY_INTERVAL_MS = 1000;
const DEFAULT_RETRY_INTERVAL_MS = 250;

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
  maxAttempts: number = MAX_ATTEMPTS,
  retryInterval: number = DEFAULT_RETRY_INTERVAL_MS,
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
    MAX_ATTEMPTS,
    RETRY_INTERVAL_MS,
  );

  if (!success) {
    throw new Error(`${windowType} window was not found or is not visible`);
  }
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
    throw new Error(`${windowType} window does not exist or is visible after ${MAX_ATTEMPTS} attempts`);
  }
});

When('I confirm the {string} window exists', async function(this: ApplicationWorld, windowType: string) {
  if (!this.app) {
    throw new Error('Application is not launched');
  }

  const success = await waitForWindowCondition(
    this.app,
    windowType,
    (window) => window !== undefined && !window.isClosed(),
    MAX_ATTEMPTS,
    RETRY_INTERVAL_MS,
  );

  if (!success) {
    throw new Error(`${windowType} window was not found or is closed`);
  }
});

When('I confirm the {string} window visible', async function(this: ApplicationWorld, windowType: string) {
  if (!this.app) {
    throw new Error('Application is not launched');
  }

  const success = await waitForWindowCondition(
    this.app,
    windowType,
    (window, isVisible) => window !== undefined && !window.isClosed() && isVisible,
    MAX_ATTEMPTS,
    RETRY_INTERVAL_MS,
  );

  if (!success) {
    throw new Error(`${windowType} window was not visible after ${MAX_ATTEMPTS} attempts`);
  }
});

When('I confirm the {string} window not visible', async function(this: ApplicationWorld, windowType: string) {
  if (!this.app) {
    throw new Error('Application is not launched');
  }

  const success = await waitForWindowCondition(
    this.app,
    windowType,
    (window, isVisible) => window !== undefined && !window.isClosed() && !isVisible,
  );

  if (!success) {
    throw new Error(`${windowType} window was visible or not found after ${MAX_ATTEMPTS} attempts`);
  }
});

When('I confirm the {string} window does not exist', async function(this: ApplicationWorld, windowType: string) {
  if (!this.app) {
    throw new Error('Application is not launched');
  }

  const success = await waitForWindowCondition(
    this.app,
    windowType,
    (window) => window === undefined,
    MAX_ATTEMPTS,
    RETRY_INTERVAL_MS,
  );

  if (!success) {
    throw new Error(`${windowType} window still exists after ${MAX_ATTEMPTS} attempts`);
  }
});