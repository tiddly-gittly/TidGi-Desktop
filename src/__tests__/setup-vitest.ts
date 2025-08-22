import 'reflect-metadata';
import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/dom';

configure({ computedStyleSupportsPseudoElements: false });
// Fix for JSDOM getComputedStyle issue - strip unsupported second parameter
const originalGetComputedStyle = window.getComputedStyle;
window.getComputedStyle = (elt) => originalGetComputedStyle.call(window, elt);

import './__mocks__/window';
import './__mocks__/services-container';
import { vi } from 'vitest';
vi.mock('react-i18next', () => import('./__mocks__/react-i18next'));
vi.mock('@services/libs/log', () => import('./__mocks__/services-log'));
// Provide a lightweight mock for electron to avoid calling real Electron APIs in tests
vi.mock('electron', () => ({
  default: {
    app: {
      setPath: (_key: string, _value: string) => undefined,
      getPath: (key: string) => {
        // Return reasonable defaults for common keys used in appPaths
        if (key === 'userData') return process.cwd();
        if (key === 'home') return process.cwd();
        return process.cwd();
      },
    },
  },
  // Also provide named export `app` to satisfy `import { app } from 'electron'`
  app: {
    setPath: (_key: string, _value: string) => undefined,
    getPath: (key: string) => {
      if (key === 'userData') return process.cwd();
      if (key === 'home') return process.cwd();
      return process.cwd();
    },
  },
}));
