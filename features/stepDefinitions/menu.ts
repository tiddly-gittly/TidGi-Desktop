import { When } from '@cucumber/cucumber';
import type { ApplicationWorld } from './application';

When('I click menu {string}', async function(this: ApplicationWorld, menuPath: string) {
  const electronApp = this.app;
  if (!electronApp) {
    throw new Error('Electron app is not available');
  }

  // Split menu path like "Wiki > Commit Now"
  const menuItems = menuPath.split('>').map(item => item.trim());

  // Retry menu click a few times to survive transient renderer navigations
  // that can destroy Playwright's execution context mid-evaluate.
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await electronApp.evaluate(({ Menu }, menuPath: string[]) => {
        const testContextMenu = (globalThis as typeof globalThis & { __tidgiLastContextMenu?: Electron.Menu }).__tidgiLastContextMenu;
        const candidateMenus = [Menu.getApplicationMenu(), testContextMenu].filter((menu): menu is Electron.Menu => menu !== undefined && menu !== null);
        const errors: string[] = [];
        for (const candidate of candidateMenus) {
          let currentMenu: Electron.Menu = candidate;
          let targetItem: Electron.MenuItem | undefined;
          try {
            for (let index = 0; index < menuPath.length; index++) {
              const label = menuPath[index];
              const item = currentMenu.items.find(menuItem => menuItem.label === label || menuItem.label.includes(label));
              if (!item) {
                throw new Error(`Menu item "${label}" not found. Available items: ${currentMenu.items.map(menuItem => menuItem.label).join(', ')}`);
              }
              if (index === menuPath.length - 1) {
                targetItem = item;
              } else {
                if (!item.submenu) throw new Error(`Menu item "${label}" does not have a submenu`);
                currentMenu = item.submenu;
              }
            }
            if (targetItem?.click) {
              (targetItem.click as () => void)();
              if (candidate === testContextMenu) {
                delete (globalThis as typeof globalThis & { __tidgiLastContextMenu?: Electron.Menu }).__tidgiLastContextMenu;
              }
              return;
            }
            throw new Error(`Cannot click menu item "${menuPath[menuPath.length - 1]}"`);
          } catch (error) {
            errors.push((error as Error).message);
          }
        }
        throw new Error(errors.join(' | '));
      }, menuItems);
      return;
    } catch (error) {
      lastError = error as Error;
      // Only retry on execution-context destruction; rethrow immediately for missing menus etc.
      if (!lastError.message.includes('Execution context was destroyed') && attempt === 2) {
        throw lastError;
      }

      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  throw lastError ?? new Error(`Failed to click menu "${menuPath}" after multiple attempts`);
});
