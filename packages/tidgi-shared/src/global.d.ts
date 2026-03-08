/**
 * Global augmentation for TW sandbox access.
 */
import type { TidgiTwGlobal } from './tidgiGlobal';

declare global {
  interface Window {
    $tw?: TidgiTwGlobal;
  }

  // TW route modules run without Window; $tw is injected directly.
  const $tw: TidgiTwGlobal;
}

export {};
