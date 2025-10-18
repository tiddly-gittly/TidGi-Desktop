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
    // Menubar window uses menubar library and may not have a standard route
    // Look for window by its title or other properties
    const allWindows = pages.filter(page => !page.isClosed());
    // Try to find by URL pattern first
    let menubarWindow = allWindows.find(page => {
      const url = page.url() || '';
      return url.includes('#/menuBar') || url.includes('#/main');
    });
    // If not found by URL, try by window properties
    if (!menubarWindow && allWindows.length > 1) {
      // Menubar is typically a smaller window
      // Get the second window (first is main)
      menubarWindow = allWindows[1];
    }
    return menubarWindow;
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

When('I confirm the {string} window exists', async function(this: ApplicationWorld, windowType: string) {
  if (!this.app) {
    throw new Error('Application is not launched');
  }

  if (windowType.toLowerCase() === 'menubar') {
    // For menubar, check via Electron API since it's a special tray window
    // Menubar is created by the menubar library and may take time to initialize
    const maxWaitAttempts = 10; // Wait up to 10 seconds
    const waitInterval = 1000; // Check every second

    for (let attempt = 0; attempt < maxWaitAttempts; attempt++) {
      const windowInfo = await this.app.evaluate(async ({ BrowserWindow }) => {
        const allWindows = BrowserWindow.getAllWindows();
        // Look for menubar window specifically by its dimensions (500x600)
        const menubarWindow = allWindows.find(win => {
          const bounds = win.getBounds();
          return bounds.width === 500 && bounds.height === 600;
        });

        return {
          hasMenubar: menubarWindow !== undefined,
        };
      });

      if (windowInfo.hasMenubar) {
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

  if (windowType.toLowerCase() === 'menubar') {
    // Special handling for menubar window visibility
    // Menubar window may take longer to show after shortcut key
    const menubarMaxAttempts = 10; // Wait up to 10 seconds
    const menubarWaitInterval = 1000; // Check every second

    for (let attempt = 0; attempt < menubarMaxAttempts; attempt++) {
      const windowInfo = await this.app.evaluate(async ({ BrowserWindow }) => {
        const allWindows = BrowserWindow.getAllWindows();
        const menubarWindow = allWindows.find(win => {
          const bounds = win.getBounds();
          return bounds.width === 500 && bounds.height === 600;
        });

        if (!menubarWindow) {
          return { found: false, visible: false };
        }

        return {
          found: true,
          visible: menubarWindow.isVisible(),
        };
      });

      if (windowInfo.visible) {
        return;
      }

      await new Promise(resolve => setTimeout(resolve, menubarWaitInterval));
    }
    throw new Error(`${windowType} window was not visible after ${menubarMaxAttempts} attempts`);
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

  if (windowType.toLowerCase() === 'menubar') {
    // Special handling for menubar window visibility check
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const windowInfo = await this.app.evaluate(async ({ BrowserWindow }) => {
        const allWindows = BrowserWindow.getAllWindows();
        const menubarWindow = allWindows.find(win => {
          const bounds = win.getBounds();
          return bounds.width === 500 && bounds.height === 600;
        });

        if (!menubarWindow) {
          return { found: false, visible: false };
        }

        return {
          found: true,
          visible: menubarWindow.isVisible(),
        };
      });

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

  if (windowType.toLowerCase() === 'menubar') {
    // Special handling for menubar window
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const windowInfo = await this.app.evaluate(async ({ BrowserWindow }) => {
        const allWindows = BrowserWindow.getAllWindows();
        // Look for menubar window specifically by its dimensions (500x600)
        const menubarWindow = allWindows.find(win => {
          const bounds = win.getBounds();
          return bounds.width === 500 && bounds.height === 600;
        });

        return {
          hasMenubar: menubarWindow !== undefined,
        };
      });

      if (!windowInfo.hasMenubar) {
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

  // Get the window dimensions to identify it
  const windowDimensions = windowType.toLowerCase() === 'menubar'
    ? { width: 500, height: 600 }
    : { width: 1178, height: 686 }; // main window default

  // Get browser view bounds for the specific window type
  const viewInfo = await this.app.evaluate(async ({ BrowserWindow }, dimensions) => {
    const windows = BrowserWindow.getAllWindows();

    // Find the target window by dimensions
    const targetWindow = windows.find(win => {
      const bounds = win.getBounds();
      return bounds.width === dimensions.width && bounds.height === dimensions.height;
    });

    if (!targetWindow) {
      return { hasView: false, error: 'Target window not found' };
    }

    // Get all child views (WebContentsView instances) attached to this specific window
    if (targetWindow.contentView && 'children' in targetWindow.contentView) {
      const views = targetWindow.contentView.children || [];

      for (const view of views) {
        // Type guard to check if view is a WebContentsView
        if (view && view.constructor.name === 'WebContentsView') {
          const webContentsView = view as unknown as { getBounds: () => { x: number; y: number; width: number; height: number } };
          const viewBounds = webContentsView.getBounds();
          const windowBounds = targetWindow.getBounds();
          const windowContentBounds = targetWindow.getContentBounds();

          return {
            view: viewBounds,
            window: windowBounds,
            windowContent: windowContentBounds,
            hasView: true,
          };
        }
      }
    }

    return { hasView: false };
  }, windowDimensions);

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

  // Get the window dimensions to identify it
  const windowDimensions = windowType.toLowerCase() === 'menubar'
    ? { width: 500, height: 600 }
    : { width: 1178, height: 686 }; // main window default

  // Get browser view bounds for the specific window type
  const viewInfo = await this.app.evaluate(async ({ BrowserWindow }, dimensions) => {
    const windows = BrowserWindow.getAllWindows();

    // Find the target window by dimensions
    const targetWindow = windows.find(win => {
      const bounds = win.getBounds();
      return bounds.width === dimensions.width && bounds.height === dimensions.height;
    });

    if (!targetWindow) {
      return { hasView: false, error: 'Target window not found' };
    }

    // Get all child views (WebContentsView instances) attached to this specific window
    if (targetWindow.contentView && 'children' in targetWindow.contentView) {
      const views = targetWindow.contentView.children || [];

      for (const view of views) {
        // Type guard to check if view is a WebContentsView
        if (view && view.constructor.name === 'WebContentsView') {
          const webContentsView = view as unknown as { getBounds: () => { x: number; y: number; width: number; height: number } };
          const viewBounds = webContentsView.getBounds();
          const windowBounds = targetWindow.getBounds();
          const windowContentBounds = targetWindow.getContentBounds();

          return {
            view: viewBounds,
            window: windowBounds,
            windowContent: windowContentBounds,
            hasView: true,
          };
        }
      }
    }

    return { hasView: false };
  }, windowDimensions);

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
