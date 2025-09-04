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
