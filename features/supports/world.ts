import { setDefaultTimeout, World } from '@cucumber/cucumber';
import path from 'path';
import { Application } from 'spectron';
// import { keyboard, Key } from '@nut-tree/nut-js';

setDefaultTimeout(30 * 1000);

const projectRoot = path.join(__dirname, '..', '..');
const packageName = process.env.npm_product_name ?? 'TidGi';

interface IContext {
  previousElement?: WebdriverIO.Element;
}
/**
 * Execution environment for TidGi in cucumber-js
 */
export class TidGiWorld extends World {
  /** our electron app instance created by spectron */
  public app?: Application;
  /** store selected element and other things, so subsequent cucumber statement can get context */
  public context?: IContext;

  /** the compiled src/main.ts */
  private readonly appPath = path.join(projectRoot, '.webpack', 'main', 'index.js');

  /** cold start the electron app */
  public async start(): Promise<void> {
    this.app = new Application({
      path: path.join(
        projectRoot,
        // The path to the binary depends on your platform and architecture
        `out/${packageName}-darwin-x64/${packageName}.app/Contents/MacOS/${packageName}`,
      ),
      args: [this.appPath],
      chromeDriverArgs: ['--disable-extensions'],
      cwd: projectRoot,
      env: {
        NODE_ENV: 'test',
      },
      port: 9156,
    });
    await this.app.start();
    await this.waitReactReady();
  }

  public async getElement(selector: string): Promise<WebdriverIO.Element | undefined> {
    const element = await this.app?.client?.$?.(selector);
    // sometimes element exist, but has an error field
    /* Element {
      sessionId: 'ae55dccb0daecda748fa4239f89d03e5',
      error: {
        error: 'no such element',
        message: 'no such element: Unable to locate element: {"method":"css selector","selector":"#test"}\n' +
          '  (Session info: chrome=89.0.4389.114)', */
    if (element !== undefined && !('error' in element)) {
      return element;
    }
  }

  /**
   * We add `<div id="test" />` to each page in react render, so we can wait until it exists
   */
  public async waitReactReady(): Promise<void> {
    await this?.app?.client?.waitUntil(async () => undefined !== (await this.getElement('#test')));
  }

  public updateContext(context: Partial<IContext>): void {
    this.context = this.context === undefined ? context : { ...this.context, ...context };
  }

  // public async type(input: string): Promise<void> {
  //   await keyboard.type(input);
  // }

  // public async hitKey(key: Key, modifier?: Key): Promise<void> {
  //   if (modifier !== undefined) {
  //     await keyboard.pressKey(modifier);
  //     await keyboard.pressKey(key);
  //     await keyboard.releaseKey(key);
  //     await keyboard.releaseKey(modifier);
  //   } else {
  //     await keyboard.pressKey(key);
  //     await keyboard.releaseKey(key);
  //   }
  // }

  public async close(): Promise<void> {
    await this.app?.stop();
  }

  public readClipboard(): string | undefined {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
    return this.app?.electron?.clipboard?.readText?.();
  }
}
