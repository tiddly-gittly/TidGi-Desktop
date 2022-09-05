/* eslint-disable @typescript-eslint/no-dynamic-delete */
import { ipcRenderer, IpcRendererEvent, MenuItemConstructorOptions, WebContents } from 'electron';

export interface IpcSafeMenuItem {
  click: string;
  label?: string;
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
  const newMenus: IpcSafeMenuItem[] = [];
  for (const menuItem of menus) {
    if (menuItem.click !== undefined) {
      const id = String(Math.random());
      // store callback into map, and use id instead. And we ipc.on that id.
      originalCallbackIdMap[id] = menuItem.click as () => void;
      const ipcCallback = (_event: IpcRendererEvent): void => {
        originalCallbackIdMap[id]?.();
        unregister();
      };
      ipcCallbackIdMap[id] = ipcCallback;
      ipcRenderer.on(id, ipcCallback);
      newMenus.push({
        ...menuItem,
        click: id,
      });
    }
  }
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
