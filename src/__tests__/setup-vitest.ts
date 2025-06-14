/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
import 'reflect-metadata';
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Configure styled-components for Material-UI compatibility
// This ensures @mui/styled-engine works correctly with styled-components
vi.mock('@mui/styled-engine', async () => {
  const actual = await vi.importActual('styled-components');
  return {
    ...actual,
    default: actual.styled,
  };
});

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

// 简化的 i18next mock
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string) => defaultValue || key,
    i18n: {
      changeLanguage: vi.fn(),
    },
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

// 简化的 ResizeObserver mock
(global as any).ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock console 方法以减少测试输出噪音
const originalError = console.error;
const originalWarn = console.warn;
console.error = vi.fn();
console.warn = vi.fn();

// 在测试结束后恢复
afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});
