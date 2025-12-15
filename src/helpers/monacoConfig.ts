import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

/**
 * Configure Monaco Editor to use local files instead of CDN
 * This prevents slow loading times caused by network requests
 *
 * Note: vite-plugin-monaco-editor handles the worker files,
 * we just need to tell @monaco-editor/react to use the local package
 */
export function initMonacoEditor(): void {
  // Use the local monaco-editor package instead of loading from CDN
  loader.config({ monaco });

  // Pre-initialize to avoid lazy loading delay
  loader.init().catch((error: unknown) => {
    console.error('Failed to initialize Monaco Editor:', error);
  });
}
