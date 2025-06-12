import { setDefaultTimeout, World } from '@cucumber/cucumber';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import { findLatestBuild, parseElectronApp } from 'electron-playwright-helpers';
import path from 'path';

setDefaultTimeout(30 * 1000);

const projectRoot = path.join(__dirname, '..', '..');

interface IContext {
  previousElement?: any;
}

/**
 * Execution environment for TidGi in cucumber-js using Playwright
 */
export class TidGiWorld extends World {
  /** our electron app instance created by Playwright */
  public app?: ElectronApplication;
  /** main page of the electron app */
  public page?: Page;
  /** store selected element and other things, so subsequent cucumber statement can get context */
  public context?: IContext;

  /** cold start the electron app */
  public async start(): Promise<void> {
    // Find the latest build in the out directory
    const latestBuild = findLatestBuild();
    
    // Parse the app details
    const appInfo = parseElectronApp(latestBuild);
    
    // Launch Electron app
    this.app = await electron.launch({
      executablePath: appInfo.executable,
      args: appInfo.main ? [appInfo.main] : [],
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    });

    // Get the main page
    this.page = await this.app.firstWindow();
    
    // Wait for the app to be ready
    await this.waitReactReady();
  }

  public async getElement(selector: string): Promise<any> {
    if (!this.page) {
      throw new Error('App not started');
    }
    
    try {
      const element = await this.page.locator(selector).first();
      const isVisible = await element.isVisible();
      return isVisible ? element : undefined;
    } catch (error) {
      console.error(`Error finding element ${selector}:`, error);
      return undefined;
    }
  }

  /**
   * We add `<div id="test" />` to each page in react render, so we can wait until it exists
   */
  public async waitReactReady(): Promise<void> {
    if (!this.page) {
      throw new Error('App not started');
    }
    
    await this.page.waitForSelector('#test', { timeout: 30000 });
  }

  public updateContext(context: Partial<IContext>): void {
    this.context = this.context === undefined ? context : { ...this.context, ...context };
  }

  public async close(): Promise<void> {
    await this.app?.close();
  }

  public async readClipboard(): Promise<string | undefined> {
    if (!this.app) {
      return undefined;
    }
    
    return await this.app.evaluate(async ({ clipboard }) => {
      return clipboard.readText();
    });
  }

  public async getWindowCount(): Promise<number> {
    if (!this.app) {
      return 0;
    }
    
    const windows = this.app.windows();
    return windows.length;
  }

  public async switchToWindow(index: number): Promise<void> {
    if (!this.app) {
      throw new Error('App not started');
    }
    
    const windows = this.app.windows();
    if (windows[index]) {
      this.page = windows[index];
      await this.waitReactReady();
    }
  }

  public async getTitle(): Promise<string> {
    if (!this.page) {
      throw new Error('Page not available');
    }
    
    return await this.page.title();
  }
}
