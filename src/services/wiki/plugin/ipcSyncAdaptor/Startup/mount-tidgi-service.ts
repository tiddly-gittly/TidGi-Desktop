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
};
