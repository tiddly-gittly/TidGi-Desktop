import { WindowNames } from '@services/windows/WindowProperties';
import { contextBridge } from 'electron';
import { windowName } from './browserViewMetaData';
import * as service from './services';

// Wiki pages can run third-party plugins. Keep diagnostic APIs that can read
// logs from other workspaces available only to trusted TidGi BrowserWindows.
const exposedService = windowName === WindowNames.view
  ? Object.fromEntries(Object.entries(service).filter(([key]) => key !== 'logViewer'))
  : service;

const attachServiceToTw = () => {
  if (typeof $tw === 'undefined') return false;
  $tw.tidgi ??= Object.create(null);
  // The preload proxy deliberately promisifies synchronous service methods,
  // so its runtime shape is not assignable to the worker-side logical service
  // declaration. Merge it at this process boundary while preserving any
  // plugin-owned fields on `$tw.tidgi`.
  if ($tw.tidgi.service === undefined) {
    Object.assign($tw.tidgi, { service: exposedService });
  }
  return true;
};

// add window.service for browserView content
contextBridge.exposeInMainWorld('service', exposedService);
// for preload script to use
window.service = service;

// keep $tw.tidgi.service available once $tw is ready
// retry until $tw is available
const tryAttach = () => {
  if (attachServiceToTw()) {
    return;
  }
  let attempts = 0;
  const maxAttempts = 100;
  const interval = setInterval(() => {
    attempts += 1;
    if (attachServiceToTw() || attempts >= maxAttempts) {
      clearInterval(interval);
    }
  }, 50);
};
tryAttach();
