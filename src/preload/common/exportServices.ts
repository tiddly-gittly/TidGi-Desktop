import type { TidgiService } from '@/types/tidgi-tw';
import { contextBridge } from 'electron';
import * as service from './services';

const attachServiceToTw = () => {
  if (typeof $tw === 'undefined') return false;
  $tw.tidgi ??= Object.create(null);
  $tw.tidgi.service ??= service as unknown as TidgiService;
  return true;
};

// add window.service for browserView content
contextBridge.exposeInMainWorld('service', service);
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
