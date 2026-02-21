/* eslint-disable */
// @ts-nocheck

declare const exports: Record<string, unknown>;

exports.name = 'mount-tidgi-service';
exports.platforms = ['browser'];
exports.after = ['startup'];
exports.synchronous = true;

exports.startup = function() {
  if (typeof $tw === 'undefined' || typeof window === 'undefined') {
    return;
  }
  if (window.service === undefined) {
    console.warn('window.service is unavailable while mounting $tw.tidgi.service');
    return;
  }

  $tw.tidgi = $tw.tidgi || Object.create(null);
  $tw.tidgi.service = $tw.tidgi.service || window.service;

  // Run fixContextIsolation in the TiddlyWiki main world to create window.observables
  // from window.service descriptors. The preload script runs fixContextIsolation in its
  // isolated world, but TiddlyWiki code runs in the main world and needs its own
  // window.observables. This was previously done by install-electron-ipc-cat.js requiring
  // the electron-ipc-cat library module.
  try {
    require('$:/plugins/linonetwo/tidgi-ipc-syncadaptor/Startup/electron-ipc-cat.js');
  } catch (e) {
    console.warn('Failed to load electron-ipc-cat for fixContextIsolation:', e);
  }

  // Ensure SSE subscription is established after services are mounted.
  // The constructor may have skipped setupSSE() if window.observables was not yet available at that point.
  // This mirrors what the old install-electron-ipc-cat.js startup module did.
  if (typeof $tw.syncadaptor?.setupSSE === 'function') {
    $tw.syncadaptor.setupSSE();
  }
};
