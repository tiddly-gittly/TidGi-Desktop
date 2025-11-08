import { When } from '@cucumber/cucumber';
import type { ApplicationWorld } from './application';

When('I click menu {string}', async function(this: ApplicationWorld, menuPath: string) {
  const electronApp = this.app;
  if (!electronApp) {
    throw new Error('Electron app is not available');
  }

  // Split menu path like "Wiki > Commit Now"
  const menuItems = menuPath.split('>').map(item => item.trim());

  // Navigate through menu hierarchy and click the final item
  await electronApp.evaluate(({ Menu }, menuPath: string[]) => {
    // Get application menu
    const appMenu = Menu.getApplicationMenu();
    if (!appMenu) {
      throw new Error('Application menu not found');
    }

    // Find menu item by path
    let currentMenu: Electron.Menu = appMenu;
    let targetItem: Electron.MenuItem | undefined;

    for (let index = 0; index < menuPath.length; index++) {
      const label = menuPath[index];
      const item = currentMenu.items.find(menuItem => menuItem.label === label || menuItem.label.includes(label));

      if (!item) {
        // Debug: log available menu items
        const availableLabels = currentMenu.items.map(menuItem => menuItem.label).join(', ');
        throw new Error(`Menu item "${label}" not found. Available items: ${availableLabels}`);
      }

      if (index === menuPath.length - 1) {
        // This is the final item to click
        targetItem = item;
      } else {
        // Navigate to submenu
        if (!item.submenu) {
          throw new Error(`Menu item "${label}" does not have a submenu`);
        }
        currentMenu = item.submenu;
      }
    }

    // Click the final menu item
    if (targetItem && targetItem.click) {
      (targetItem.click as () => void)();
    } else {
      throw new Error(`Cannot click menu item "${menuPath[menuPath.length - 1]}"`);
    }
  }, menuItems);
});
