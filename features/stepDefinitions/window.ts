import { When } from '@cucumber/cucumber';
import type { ElectronApplication, Page } from 'playwright';
import { windowDimension, WindowNames } from '../../src/services/windows/WindowProperties';
import type { ApplicationWorld } from './application';

// Constants for retry logic
const MAX_ATTEMPTS = 3;
const RETRY_INTERVAL_MS = 1000;
const DEFAULT_RETRY_INTERVAL_MS = 250;

// Window dimensions - validated at module load
const TIDGI_MINI_WINDOW_SIZE = windowDimension[WindowNames.tidgiMiniWindow];
const MAIN_WINDOW_SIZE = windowDimension[WindowNames.main];

if (!TIDGI_MINI_WINDOW_SIZE.width || !TIDGI_MINI_WINDOW_SIZE.height) {
  throw new Error('TidGi mini window dimensions are not properly defined');
}

if (!MAIN_WINDOW_SIZE.width || !MAIN_WINDOW_SIZE.height) {
  throw new Error('Main window dimensions are not properly defined');
}

// Helper function to find window by type
async function findWindowByType(app: ElectronApplication, windowType: string): Promise<Page | undefined> {
  // Validate window type first
  const windowName = checkWindowName(windowType);

  const pages = app.windows();

  if (windowName === WindowNames.tidgiMiniWindow) {
    // Special handling for tidgi mini window
    // TidGi mini window may not have a standard route
    // Look for window by its title or other properties
    const allWindows = pages.filter(page => !page.isClosed());
    // Try to find by URL pattern first
    let tidgiMiniWindow = allWindows.find(page => {
      const url = page.url() || '';
      return url.includes('#/tidgiMiniWindow') || url.includes('#/main');
    });
    // If not found by URL, try by window properties
    if (!tidgiMiniWindow && allWindows.length > 1) {
      // TidGi mini window is typically a smaller window
      // Get the second window (first is main)
      tidgiMiniWindow = allWindows[1];
    }
    return tidgiMiniWindow;
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

// Helper function to check if window type is valid and return the corresponding WindowNames
function checkWindowName(windowType: string): WindowNames {
  // Exact match - windowType must be a valid WindowNames enum key
  if (windowType in WindowNames) {
    return (WindowNames as Record<string, WindowNames>)[windowType];
  }
  throw new Error(`Window type "${windowType}" is not a valid WindowNames. Check the WindowNames enum in WindowProperties.ts`);
}

// Helper function to get window dimensions and ensure they are valid
function checkWindowDimension(windowName: WindowNames): { width: number; height: number } {
  const targetDimensions = windowDimension[windowName];
  if (!targetDimensions.width || !targetDimensions.height) {
    throw new Error(`Window "${windowName}" does not have valid dimensions defined in windowDimension`);
  }
  return targetDimensions as { width: number; height: number };
}

// Helper function to get browser view info from Electron window
async function getBrowserViewInfo(
  app: ElectronApplication,
  dimensions: { width: number; height: number },
): Promise<{ view?: { x: number; y: number; width: number; height: number }; windowContent?: { width: number; height: number }; hasView: boolean }> {
  return app.evaluate(async ({ BrowserWindow }, dimensions: { width: number; height: number }) => {
    const windows = BrowserWindow.getAllWindows();

    // Find the target window by dimensions
    const targetWindow = windows.find(win => {
      const bounds = win.getBounds();
      return bounds.width === dimensions.width && bounds.height === dimensions.height;
    });

    if (!targetWindow) {
      return { hasView: false };
    }

    // Get all child views (WebContentsView instances) attached to this specific window
    if (targetWindow.contentView && 'children' in targetWindow.contentView) {
      const views = targetWindow.contentView.children || [];

      for (const view of views) {
        // Type guard to check if view is a WebContentsView
        if (view && view.constructor.name === 'WebContentsView') {
          const webContentsView = view as unknown as { getBounds: () => { x: number; y: number; width: number; height: number } };
          const viewBounds = webContentsView.getBounds();
          const windowContentBounds = targetWindow.getContentBounds();

          return {
            view: viewBounds,
            windowContent: windowContentBounds,
            hasView: true,
          };
        }
      }
    }

    return { hasView: false };
  }, dimensions);
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

When('I confirm the {string} window exists', async function(this: ApplicationWorld, windowType: string) {
  if (!this.app) {
    throw new Error('Application is not launched');
  }

  if (windowType === 'tidgiMiniWindow') {
    // For tidgi mini window, check via Electron API since it's a special tray window
    // TidGi mini window may take time to initialize
    const maxWaitAttempts = 10; // Wait up to 10 seconds
    const waitInterval = 1000; // Check every second

    for (let attempt = 0; attempt < maxWaitAttempts; attempt++) {
      const windowInfo = await this.app.evaluate(async ({ BrowserWindow }, size: { width: number; height: number }) => {
        const allWindows = BrowserWindow.getAllWindows();
        // Look for tidgi mini window specifically by its dimensions (500x600)
        const tidgiMiniWindow = allWindows.find(win => {
          const bounds = win.getBounds();
          return bounds.width <= size.width && bounds.height <= size.height;
        });

        return tidgiMiniWindow !== undefined;
      }, TIDGI_MINI_WINDOW_SIZE as { width: number; height: number });

      if (windowInfo) {
        return;
      }

      await new Promise(resolve => setTimeout(resolve, waitInterval));
    }
    throw new Error(`${windowType} window was not found after ${maxWaitAttempts} attempts`);
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

  if (windowType === 'tidgiMiniWindow') {
    // Special handling for tidgi mini window visibility
    // TidGi mini window may take longer to show after shortcut key
    const tidgiMiniWindowMaxAttempts = 10; // Wait up to 10 seconds
    const tidgiMiniWindowWaitInterval = 1000; // Check every second

    for (let attempt = 0; attempt < tidgiMiniWindowMaxAttempts; attempt++) {
      const windowInfo = await this.app.evaluate(async ({ BrowserWindow }, size: { width: number; height: number }) => {
        const allWindows = BrowserWindow.getAllWindows();
        const tidgiMiniWindow = allWindows.find(win => {
          const bounds = win.getBounds();
          return bounds.width === size.width && bounds.height === size.height;
        });

        if (!tidgiMiniWindow) {
          return { found: false, visible: false };
        }

        return {
          found: true,
          visible: tidgiMiniWindow.isVisible(),
        };
      }, TIDGI_MINI_WINDOW_SIZE as { width: number; height: number });

      if (windowInfo.visible) {
        return;
      }

      await new Promise(resolve => setTimeout(resolve, tidgiMiniWindowWaitInterval));
    }
    throw new Error(`${windowType} window was not visible after ${tidgiMiniWindowMaxAttempts} attempts`);
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

  if (windowType === 'tidgiMiniWindow') {
    // Special handling for tidgi mini window visibility check
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const windowInfo = await this.app.evaluate(async ({ BrowserWindow }, size: { width: number; height: number }) => {
        const allWindows = BrowserWindow.getAllWindows();
        const tidgiMiniWindow = allWindows.find(win => {
          const bounds = win.getBounds();
          return bounds.width === size.width && bounds.height === size.height;
        });

        if (!tidgiMiniWindow) {
          return { found: false, visible: false };
        }

        return {
          found: true,
          visible: tidgiMiniWindow.isVisible(),
        };
      }, TIDGI_MINI_WINDOW_SIZE as { width: number; height: number });

      if (windowInfo.found && !windowInfo.visible) {
        return;
      }

      await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL_MS));
    }
    throw new Error(`${windowType} window was visible or not found after ${MAX_ATTEMPTS} attempts`);
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

  if (windowType === 'tidgiMiniWindow') {
    // Special handling for tidgi mini window
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const windowInfo = await this.app.evaluate(async ({ BrowserWindow }, size: { width: number; height: number }) => {
        const allWindows = BrowserWindow.getAllWindows();
        // Look for tidgi mini window specifically by its dimensions (500x600)
        const tidgiMiniWindow = allWindows.find(win => {
          const bounds = win.getBounds();
          return bounds.width === size.width && bounds.height === size.height;
        });

        return {
          hasTidgiMiniWindow: tidgiMiniWindow !== undefined,
        };
      }, TIDGI_MINI_WINDOW_SIZE as { width: number; height: number });

      if (!windowInfo.hasTidgiMiniWindow) {
        return;
      }

      await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL_MS));
    }
    throw new Error(`${windowType} window still exists after ${MAX_ATTEMPTS} attempts`);
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

When('I confirm the {string} window browser view is positioned within visible window bounds', async function(this: ApplicationWorld, windowType: string) {
  if (!this.app) {
    throw new Error('Application is not available');
  }

  const targetWindow = await findWindowByType(this.app, windowType);
  if (!targetWindow || targetWindow.isClosed()) {
    throw new Error(`Window "${windowType}" is not available or has been closed`);
  }

  // Get the window dimensions to identify it - must match a defined WindowNames
  const windowName = checkWindowName(windowType);
  const windowDimensions = checkWindowDimension(windowName);

  // Get browser view bounds for the specific window type
  const viewInfo = await getBrowserViewInfo(this.app, windowDimensions);

  if (!viewInfo.hasView || !viewInfo.view || !viewInfo.windowContent) {
    throw new Error(`No browser view found in "${windowType}" window`);
  }

  // Check if browser view is within window content bounds
  // View coordinates are relative to the window, so we check if they're within the content area
  const viewRight = viewInfo.view.x + viewInfo.view.width;
  const viewBottom = viewInfo.view.y + viewInfo.view.height;
  const contentWidth = viewInfo.windowContent.width;
  const contentHeight = viewInfo.windowContent.height;

  const isWithinBounds = viewInfo.view.x >= 0 &&
    viewInfo.view.y >= 0 &&
    viewRight <= contentWidth &&
    viewBottom <= contentHeight &&
    viewInfo.view.width > 0 &&
    viewInfo.view.height > 0;

  if (!isWithinBounds) {
    throw new Error(
      `Browser view is not positioned within visible window bounds.\n` +
        `View: {x: ${viewInfo.view.x}, y: ${viewInfo.view.y}, width: ${viewInfo.view.width}, height: ${viewInfo.view.height}}, ` +
        `Window content: {width: ${contentWidth}, height: ${contentHeight}}`,
    );
  }
});

When('I confirm the {string} window browser view is not positioned within visible window bounds', async function(this: ApplicationWorld, windowType: string) {
  if (!this.app) {
    throw new Error('Application is not available');
  }

  const targetWindow = await findWindowByType(this.app, windowType);
  if (!targetWindow || targetWindow.isClosed()) {
    throw new Error(`Window "${windowType}" is not available or has been closed`);
  }

  // Get the window dimensions to identify it - must match a defined WindowNames
  const windowName = checkWindowName(windowType);
  const windowDimensions = checkWindowDimension(windowName);

  // Get browser view bounds for the specific window type
  const viewInfo = await getBrowserViewInfo(this.app, windowDimensions);

  if (!viewInfo.hasView || !viewInfo.view || !viewInfo.windowContent) {
    // No view found is acceptable for this check - means it's definitely not visible
    return;
  }

  // Check if browser view is OUTSIDE window content bounds
  // View coordinates are relative to the window, so we check if they're outside the content area
  const viewRight = viewInfo.view.x + viewInfo.view.width;
  const viewBottom = viewInfo.view.y + viewInfo.view.height;
  const contentWidth = viewInfo.windowContent.width;
  const contentHeight = viewInfo.windowContent.height;

  const isWithinBounds = viewInfo.view.x >= 0 &&
    viewInfo.view.y >= 0 &&
    viewRight <= contentWidth &&
    viewBottom <= contentHeight &&
    viewInfo.view.width > 0 &&
    viewInfo.view.height > 0;

  if (isWithinBounds) {
    throw new Error(
      `Browser view IS positioned within visible window bounds, but expected it to be outside.\n` +
        `View: {x: ${viewInfo.view.x}, y: ${viewInfo.view.y}, width: ${viewInfo.view.width}, height: ${viewInfo.view.height}}, ` +
        `Window content: {width: ${contentWidth}, height: ${contentHeight}}`,
    );
  }
});
