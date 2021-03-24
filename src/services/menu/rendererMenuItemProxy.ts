import { ipcRenderer, IpcRendererEvent, MenuItemConstructorOptions, WebContents } from 'electron';
import { v4 as uuid } from 'uuid';

export interface IpcSafeMenuItem {
  label?: string;
  click: string;
}

/**
 * Iterate through the object, replace each object method with a random uuid, and send this object without a callback to the main thread.
 * Register IPCRenderer.on(uuid for each object method
 * @returns unregister function
 */
export function rendererMenuItemProxy(menus: MenuItemConstructorOptions[]): [IpcSafeMenuItem[], () => void] {
  const originalCallbackIdMap: Record<string, () => void> = {};
  const ipcCallbackIdMap: Record<string, (_event: IpcRendererEvent) => void> = {};
  const newMenus: IpcSafeMenuItem[] = [];
  for (const menuItem of menus) {
    if (menuItem.click !== undefined) {
      const id = uuid();
      // store callback into map, and use id instead. And we ipc.on that id.
      originalCallbackIdMap[id] = menuItem.click as () => void;
      const ipcCallback = (_event: IpcRendererEvent): void => {
        originalCallbackIdMap[id]?.();
      };
      ipcCallbackIdMap[id] = ipcCallback;
      ipcRenderer.on(id, ipcCallback);
      newMenus.push({
        label: menuItem.label,
        click: id,
      });
    }
  }

  const unregister = (): void => {
    Object.keys(originalCallbackIdMap).forEach((id) => ipcRenderer.removeListener(id, ipcCallbackIdMap[id]));
  };
  return [newMenus, unregister];
}

/**
 * Reconstruct the object with callback on the main process, the callback is just IPCMain.invoke(uuid
 */
export function mainMenuItemProxy(menus: IpcSafeMenuItem[], webContents: WebContents): MenuItemConstructorOptions[] {
  const newMenus: MenuItemConstructorOptions[] = [];
  for (const menu of menus) {
    const clickIpcCallback = (): void => {
      webContents.send(menu.click);
    };
    newMenus.push({ ...menu, click: clickIpcCallback });
  }

  return newMenus;
}
