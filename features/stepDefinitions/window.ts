import { When } from '@cucumber/cucumber';
import type { ElectronApplication } from 'playwright';
import type { ApplicationWorld } from './application';
import { checkWindowDimension, checkWindowName } from './application';

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

When('I confirm the {string} window exists', async function(this: ApplicationWorld, windowType: string) {
  if (!this.app) {
    throw new Error('Application is not launched');
  }

  const success = await this.waitForWindowCondition(
    windowType,
    (window) => window !== undefined && !window.isClosed(),
  );

  if (!success) {
    throw new Error(`${windowType} window was not found or is closed`);
  }
});

When('I confirm the {string} window visible', async function(this: ApplicationWorld, windowType: string) {
  if (!this.app) {
    throw new Error('Application is not launched');
  }

  const success = await this.waitForWindowCondition(
    windowType,
    (window, isVisible) => window !== undefined && !window.isClosed() && isVisible,
  );

  if (!success) {
    throw new Error(`${windowType} window was not visible after multiple attempts`);
  }
});

When('I confirm the {string} window not visible', async function(this: ApplicationWorld, windowType: string) {
  if (!this.app) {
    throw new Error('Application is not launched');
  }

  const success = await this.waitForWindowCondition(
    windowType,
    (window, isVisible) => window !== undefined && !window.isClosed() && !isVisible,
  );

  if (!success) {
    throw new Error(`${windowType} window was visible or not found after multiple attempts`);
  }
});

When('I confirm the {string} window does not exist', async function(this: ApplicationWorld, windowType: string) {
  if (!this.app) {
    throw new Error('Application is not launched');
  }

  const success = await this.waitForWindowCondition(
    windowType,
    (window) => window === undefined,
  );

  if (!success) {
    throw new Error(`${windowType} window still exists after multiple attempts`);
  }
});

When('I confirm the {string} window browser view is positioned within visible window bounds', async function(this: ApplicationWorld, windowType: string) {
  if (!this.app) {
    throw new Error('Application is not available');
  }

  const targetWindow = await this.findWindowByType(windowType);
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

  const targetWindow = await this.findWindowByType(windowType);
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
