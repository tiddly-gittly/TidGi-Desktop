/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
import 'reflect-metadata';
import '@testing-library/jest-dom/vitest';
import { BehaviorSubject } from 'rxjs';
import { afterAll, vi } from 'vitest';

// 简化的 Electron API mock
const mockElectron = {
  ipcRenderer: {
    invoke: vi.fn().mockResolvedValue(undefined),
    send: vi.fn(),
    on: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  shell: {
    openExternal: vi.fn().mockResolvedValue(undefined),
  },
  app: {
    getVersion: vi.fn(() => '0.12.1'),
    getPath: vi.fn(() => '/mock/path'),
  },
};

vi.mock('electron', () => mockElectron);

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

// 简化的 i18next mock
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

// 优化的 window.matchMedia mock
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: any) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

(global as any).ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

const originalError = console.error;
const originalWarn = console.warn;
console.error = vi.fn();
console.warn = vi.fn();

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});
