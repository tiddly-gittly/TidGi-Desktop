/* eslint-disable @typescript-eslint/no-dynamic-delete */
import { ipcRenderer, IpcRendererEvent, MenuItemConstructorOptions, WebContents } from 'electron';

export interface IpcSafeMenuItem {
  click: string;
  enabled?: boolean;
  label?: string;
  submenu?: IpcSafeMenuItem[];
  type?: 'normal' | 'separator' | 'submenu' | 'checkbox' | 'radio' | 'header' | 'palette';
}

/**
 * Iterate through the object, replace each object method with a random uuid, and send this object without a callback to the main thread.
 * Register IPCRenderer.on(uuid for each object method
 * @returns unregister function
 */
export function rendererMenuItemProxy(menus: MenuItemConstructorOptions[]): [IpcSafeMenuItem[], () => void] {
  const originalCallbackIdMap: Record<string, () => void> = {};
  const ipcCallbackIdMap: Record<string, (_event: IpcRendererEvent) => void> = {};
  const unregister = (): void => {
    Object.keys(originalCallbackIdMap).forEach((id) => {
      ipcRenderer.removeListener(id, ipcCallbackIdMap[id]);
      delete originalCallbackIdMap[id];
      delete ipcCallbackIdMap[id];
    });
  };

  const processMenuItem = (menuItem: MenuItemConstructorOptions): IpcSafeMenuItem => {
    const safeItem: IpcSafeMenuItem = {
      click: '',
      label: menuItem.label,
      type: menuItem.type,
      enabled: menuItem.enabled,
    };

    // Handle submenu recursively
    if (Array.isArray(menuItem.submenu)) {
      safeItem.submenu = menuItem.submenu.map(processMenuItem);
    }

    // Handle click callback
    if (menuItem.click !== undefined) {
      const id = String(Math.random());
      // store callback into map, and use id instead. And we ipc.on that id.
      originalCallbackIdMap[id] = menuItem.click as () => void;
      const ipcCallback = (_event: IpcRendererEvent): void => {
        originalCallbackIdMap[id]();
        unregister();
      };
      ipcCallbackIdMap[id] = ipcCallback;
      ipcRenderer.on(id, ipcCallback);
      safeItem.click = id;
    }

    return safeItem;
  };

  const newMenus: IpcSafeMenuItem[] = menus.map(processMenuItem);
  return [newMenus, unregister];
}

/**
 * Reconstruct the object with callback on the main process, the callback is just IPCMain.invoke(uuid
 */
export function mainMenuItemProxy(menus: IpcSafeMenuItem[], webContents: WebContents): MenuItemConstructorOptions[] {
  const processMenuItem = (menu: IpcSafeMenuItem): MenuItemConstructorOptions => {
    const menuItem: MenuItemConstructorOptions = {
      label: menu.label,
      type: menu.type,
      enabled: menu.enabled,
    };

    // Handle submenu recursively
    if (Array.isArray(menu.submenu)) {
      menuItem.submenu = menu.submenu.map(processMenuItem);
    }

    // Handle click callback (only if click ID is not empty)
    if (menu.click && menu.click.length > 0) {
      menuItem.click = (): void => {
        webContents.send(menu.click);
      };
    }

    return menuItem;
  };

  return menus.map(processMenuItem);
}
