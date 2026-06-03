import { When } from '@cucumber/cucumber';
import { backOff } from 'exponential-backoff';
import type { ApplicationWorld } from './application';

function isViewWithinBounds(
  view: { x: number; y: number; width: number; height: number },
  windowContent: { width: number; height: number },
): boolean {
  const viewRight = view.x + view.width;
  const viewBottom = view.y + view.height;

  return view.x >= 0 &&
    view.y >= 0 &&
    viewRight <= windowContent.width &&
    viewBottom <= windowContent.height &&
    view.width > 0 &&
    view.height > 0;
}

When('I confirm the {string} window exists', async function(this: ApplicationWorld, windowType: string) {
  if (!this.app) {
    throw new Error('Application is not launched');
  }

  const success = await this.waitForWindowCondition(
    windowType,
    (window) => window !== undefined,
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
    (window, isVisible) => window !== undefined && !isVisible,
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

  const browserWindow = await this.app.browserWindow(targetWindow);

  // Retry with backoff: browser view repositioning can lag behind DOM updates
  await backOff(async () => {
    const viewInfo = await browserWindow.evaluate((win: Electron.BrowserWindow) => {
      const children = 'children' in win.contentView ? (win.contentView.children || []) : [];
      const webContentsViews = children
        .filter((child) => child && child.constructor.name === 'WebContentsView')
        .map((child) => (child as Electron.WebContentsView).getBounds());
      return {
        views: webContentsViews,
        content: win.getContentBounds(),
      };
    });

    if (viewInfo.views.length === 0) {
      throw new Error(`No browser view found in "${windowType}" window (retrying)`);
    }

    const visibleView = viewInfo.views.find((view) => isViewWithinBounds(view, viewInfo.content));

    if (!visibleView) {
      const sampledView = viewInfo.views[0];
      throw new Error(
        `Browser view is not positioned within visible window bounds (retrying).\n` +
          `Views: ${JSON.stringify(viewInfo.views)}, ` +
          `Window content: {width: ${viewInfo.content.width}, height: ${viewInfo.content.height}}` +
          (sampledView ? `, First view: {x: ${sampledView.x}, y: ${sampledView.y}, width: ${sampledView.width}, height: ${sampledView.height}}` : ''),
      );
    }
  }, {
    numOfAttempts: 10,
    startingDelay: 200,
    timeMultiple: 1,
    maxDelay: 500,
  });
});

When('I confirm the {string} window browser view is not positioned within visible window bounds', async function(this: ApplicationWorld, windowType: string) {
  if (!this.app) {
    throw new Error('Application is not available');
  }

  const targetWindow = await this.findWindowByType(windowType);
  if (!targetWindow || targetWindow.isClosed()) {
    throw new Error(`Window "${windowType}" is not available or has been closed`);
  }

  const browserWindow = await this.app.browserWindow(targetWindow);

  // Retry with backoff: browser view hiding can lag behind workspace switching
  await backOff(async () => {
    const viewInfo = await browserWindow.evaluate((win: Electron.BrowserWindow) => {
      const children = 'children' in win.contentView ? (win.contentView.children || []) : [];
      const webContentsViews = children
        .filter((child) => child && child.constructor.name === 'WebContentsView')
        .map((child) => (child as Electron.WebContentsView).getBounds());
      return {
        views: webContentsViews,
        content: win.getContentBounds(),
      };
    });

    if (viewInfo.views.length === 0) {
      // No view found is acceptable for this check
      return;
    }

    const visibleView = viewInfo.views.find((view) => isViewWithinBounds(view, viewInfo.content));

    if (visibleView) {
      throw new Error(
        `Browser view IS positioned within visible window bounds, but expected it to be outside (retrying).\n` +
          `Visible view: {x: ${visibleView.x}, y: ${visibleView.y}, width: ${visibleView.width}, height: ${visibleView.height}}, ` +
          `All views: ${JSON.stringify(viewInfo.views)}, ` +
          `Window content: {width: ${viewInfo.content.width}, height: ${viewInfo.content.height}}`,
      );
    }
  }, {
    numOfAttempts: 5,
    startingDelay: 200,
    timeMultiple: 1,
    maxDelay: 500,
  });
});

When('I resize the {string} window to {int}x{int}', async function(this: ApplicationWorld, windowType: string, width: number, height: number) {
  if (!this.app) {
    throw new Error('Application is not launched');
  }

  const targetWindow = await this.findWindowByType(windowType);
  if (!targetWindow || targetWindow.isClosed()) {
    throw new Error(`Window "${windowType}" is not available or has been closed`);
  }

  const browserWindow = await this.app.browserWindow(targetWindow);
  await browserWindow.evaluate((win: Electron.BrowserWindow, size: { width: number; height: number }) => {
    const bounds = win.getBounds();
    win.setBounds({ ...bounds, width: size.width, height: size.height });
  }, { width, height });
  // View resize is debounced by 200ms in ViewService. Wait past that boundary so
  // we assert the final state, not the transient pre-resize bounds.
  await this.app.evaluate(async () => new Promise<void>(resolve => setTimeout(resolve, 350)));
});

When('I confirm the {string} window browser view fills the window content area', async function(this: ApplicationWorld, windowType: string) {
  if (!this.app) {
    throw new Error('Application is not available');
  }

  const targetWindow = await this.findWindowByType(windowType);
  if (!targetWindow || targetWindow.isClosed()) {
    throw new Error(`Window "${windowType}" is not available or has been closed`);
  }

  const browserWindow = await this.app.browserWindow(targetWindow);
  const viewInfo = await browserWindow.evaluate((win: Electron.BrowserWindow) => {
    const children = 'children' in win.contentView ? (win.contentView.children || []) : [];
    const targetView = children.find((child) => child && child.constructor.name === 'WebContentsView') as Electron.WebContentsView | undefined;
    if (!targetView) {
      return { hasView: false };
    }
    return {
      hasView: true,
      view: targetView.getBounds(),
      content: win.getContentBounds(),
    };
  });

  if (!viewInfo.hasView || !viewInfo.view || !viewInfo.content) {
    throw new Error(`No browser view found in "${windowType}" window`);
  }

  const expectedWidth = viewInfo.content.width - viewInfo.view.x;
  const expectedHeight = viewInfo.content.height - viewInfo.view.y;
  const matches = viewInfo.view.width === expectedWidth && viewInfo.view.height === expectedHeight;

  if (!matches) {
    throw new Error(
      `Browser view does not fill the window content area.\n` +
        `View: {x: ${viewInfo.view.x}, y: ${viewInfo.view.y}, width: ${viewInfo.view.width}, height: ${viewInfo.view.height}}\n` +
        `Content: {width: ${viewInfo.content.width}, height: ${viewInfo.content.height}}\n` +
        `Expected view size: {width: ${expectedWidth}, height: ${expectedHeight}}`,
    );
  }
});
