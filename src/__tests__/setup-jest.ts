/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
import 'reflect-metadata';
import '@testing-library/jest-dom';

// 简化的 Electron API mock
const mockElectron = {
  ipcRenderer: {
    invoke: jest.fn().mockResolvedValue(undefined),
    send: jest.fn(),
    on: jest.fn(),
    removeAllListeners: jest.fn(),
  },
  shell: {
    openExternal: jest.fn().mockResolvedValue(undefined),
  },
  app: {
    getVersion: jest.fn(() => '0.12.1'),
    getPath: jest.fn(() => '/mock/path'),
  },
};

jest.mock('electron', () => mockElectron);

// 简化的 i18next mock
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string) => defaultValue || key,
    i18n: {
      changeLanguage: jest.fn(),
    },
  }),
  Trans: ({ children }: { children: any }) => children,
}));

// 优化的 window.matchMedia mock
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query: any) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// 简化的 ResizeObserver mock
(global as any).ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock console 方法以减少测试输出噪音
const originalError = console.error;
const originalWarn = console.warn;
console.error = jest.fn();
console.warn = jest.fn();

// 在测试结束后恢复
afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});
