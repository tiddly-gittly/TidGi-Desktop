import { BaseWindow, BrowserWindow } from 'electron';

export function isBrowserWindow(win: BaseWindow | undefined): win is BrowserWindow {
  return win !== undefined && 'webContents' in win;
}
