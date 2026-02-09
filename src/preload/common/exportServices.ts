import { contextBridge } from 'electron';
import * as service from './services';

const attachServiceToTw = () => {
  if (typeof window === 'undefined') return;
  const tw = (window as unknown as { $tw?: { tidgi?: Record<string, unknown> } }).$tw;
  if (!tw) return;
  if (!tw.tidgi) {
    tw.tidgi = {};
  }
  (tw.tidgi as { service?: typeof service }).service = service;
};

// add window.service for browserView content
contextBridge.exposeInMainWorld('service', service);
// for preload script to use
window.service = service;

// keep $tw.tidgi.service available once $tw is ready
attachServiceToTw();
window.addEventListener('DOMContentLoaded', attachServiceToTw);
