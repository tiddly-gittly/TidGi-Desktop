/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
import 'reflect-metadata';
import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/dom';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';

configure({
  computedStyleSupportsPseudoElements: false,
});

// Fix for JSDOM getComputedStyle issue - strip unsupported second parameter
const originalGetComputedStyle = window.getComputedStyle;
window.getComputedStyle = (elt) => originalGetComputedStyle.call(window, elt);

// Mock window.meta globally
Object.defineProperty(window, 'meta', {
  writable: true,
  value: vi.fn(() => ({
    windowName: 'main',
  })),
});

// Mock window.service for necessary async calls - common across all tests
Object.defineProperty(window, 'service', {
  writable: true,
  value: {
    workspace: {
      countWorkspaces: vi.fn().mockResolvedValue(5),
      openWorkspaceTiddler: vi.fn().mockResolvedValue(undefined),
    },
    workspaceView: {
      setActiveWorkspaceView: vi.fn().mockResolvedValue(undefined),
    },
    window: {
      open: vi.fn().mockResolvedValue(undefined),
    },
    native: {
      log: vi.fn().mockResolvedValue(undefined),
      pickDirectory: vi.fn().mockResolvedValue(['/test/selected/path']),
    },
    wiki: {
      getSubWikiPluginContent: vi.fn().mockResolvedValue([]),
    },
    auth: {
      getStorageServiceUserInfo: vi.fn().mockResolvedValue(undefined),
    },
    context: {
      get: vi.fn().mockResolvedValue(undefined),
    },
    preference: {
      get: vi.fn().mockResolvedValue(undefined),
    },
  },
});

// Mock window.remote for FindInPage functionality - common across all tests
Object.defineProperty(window, 'remote', {
  writable: true,
  value: {
    registerOpenFindInPage: vi.fn(),
    registerCloseFindInPage: vi.fn(),
    registerUpdateFindInPageMatches: vi.fn(),
    unregisterOpenFindInPage: vi.fn(),
    unregisterCloseFindInPage: vi.fn(),
    unregisterUpdateFindInPageMatches: vi.fn(),
  },
});

// Mock window.observables with default empty observables - can be overridden in specific tests
Object.defineProperty(window, 'observables', {
  writable: true,
  value: {
    preference: {
      preference$: new BehaviorSubject({}).asObservable(),
    },
    workspace: {
      workspaces$: new BehaviorSubject([]).asObservable(),
    },
    updater: {
      updaterMetaData$: new BehaviorSubject(undefined).asObservable(),
    },
    auth: {
      userInfo$: new BehaviorSubject(undefined).asObservable(),
    },
  },
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string) => defaultValue || key,
    i18n: {
      changeLanguage: vi.fn(),
    },
  }),
  getI18n: () => ({
    t: (key: string, defaultValue?: string) => defaultValue || key,
    changeLanguage: vi.fn(),
  }),
  Trans: ({ children }: { children: any }) => children,
}));
