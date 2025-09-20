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

/**
 * Mock the `electron` module for testing
 *
 * CRITICAL: This mock is essential for proper test environment isolation.
 *
 * Why this mock is necessary:
 * 1. In real Electron, app.setPath() and app.getPath() manage application directories
 * 2. appPaths.ts calls app.setPath('userData', 'userData-test') in test environment
 * 3. Without a proper mock, these calls would be no-ops and paths would be wrong
 * 4. This leads to test databases/settings being created in wrong directories
 *
 * What this mock provides:
 * - Functional app.setPath() that actually stores path values
 * - Functional app.getPath() that retrieves stored paths
 * - Proper test isolation by ensuring userData goes to 'userData-test/'
 *
 * This mock enables appPaths.ts to work correctly in tests, ensuring:
 * - CACHE_DATABASE_FOLDER = 'userData-test/cache-database/'
 * - SETTINGS_FOLDER = 'userData-test/settings/'
 * - No pollution of project root directory during tests
 */
vi.mock('electron', () => {
  // Create a mock that can store and retrieve userData path
  let userDataPath = process.cwd(); // default

  const mockApp = {
    setPath: (key: string, value: string) => {
      if (key === 'userData') {
        userDataPath = value;
      }
    },
    getPath: (key: string) => {
      if (key === 'userData') return userDataPath;
      if (key === 'home') return process.cwd();
      return process.cwd();
    },
  };

  return {
    default: {
      app: mockApp,
    },
    // Also provide named export `app` to satisfy `import { app } from 'electron'`
    app: mockApp,
  };
});

// Import appPaths to ensure the path setup is executed during test initialization
// This is critical - without this import, appPaths.ts won't be evaluated and
// app.setPath('userData', 'userData-test') won't be called!
import '@/constants/appPaths';

/**
 * Mock matchMedia and other DOM APIs for components using autocomplete search functionality
 *
 * Why this mock is necessary:
 * - @algolia/autocomplete-js uses matchMedia() to detect mobile devices for responsive behavior
 * - @algolia/autocomplete-js also tries to access document/window event properties that don't exist in JSDOM
 * - JSDOM test environment doesn't provide matchMedia() API by default
 * - Without this mock, components using TemplateSearch or Search will throw errors
 * - This enables CreateNewAgentContent and other search-related components to render in tests
 *
 * Components that need this:
 * - CreateNewAgentContent (uses TemplateSearch)
 * - NewTabContent (uses Search)
 * - Any component using Search.tsx or autocomplete functionality
 */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock document and window with comprehensive event handling for autocomplete components
Object.defineProperty(document, 'documentElement', {
  writable: true,
  value: Object.assign(document.documentElement || document.createElement('html'), {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    mousedown: vi.fn(),
    ontouchstart: vi.fn(),
  }),
});

Object.defineProperty(document, 'body', {
  writable: true,
  value: Object.assign(document.body || document.createElement('body'), {
    mousedown: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    ontouchstart: vi.fn(),
  }),
});

// Enhanced window mock with comprehensive event support
Object.defineProperty(window, 'addEventListener', {
  writable: true,
  value: vi.fn(),
});

Object.defineProperty(window, 'removeEventListener', {
  writable: true,
  value: vi.fn(),
});

// Mock touch events for autocomplete
Object.defineProperty(window, 'ontouchstart', {
  writable: true,
  value: vi.fn(),
});

// Prevent unhandled promise rejections from autocomplete
window.addEventListener = vi.fn();
window.removeEventListener = vi.fn();
