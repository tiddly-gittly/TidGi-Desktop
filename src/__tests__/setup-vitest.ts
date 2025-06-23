/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/no-unsafe-return */

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

// Mock logger to prevent Electron app dependency issues
vi.mock('@services/libs/log', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

// Shared service instances for both window.service and container mocks
const mockServiceInstances = {
  workspace: {
    countWorkspaces: vi.fn().mockResolvedValue(5),
    openWorkspaceTiddler: vi.fn().mockResolvedValue(undefined),
    concatPrompt: vi.fn().mockResolvedValue({
      flatPrompts: [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hello' },
      ],
    }),
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
  externalAPI: {
    getAIConfig: vi.fn().mockResolvedValue({
      api: { model: 'test-model', provider: 'test-provider' },
      modelParameters: {},
    }),
    generateFromAI: vi.fn(),
    cancelAIRequest: vi.fn(),
  },
  agentDefinition: {
    matchToolCalling: vi.fn().mockResolvedValue({ found: false }),
  },
};

// Mock window.service using shared instances
Object.defineProperty(window, 'service', {
  writable: true,
  value: mockServiceInstances,
});

// Mock container using shared instances
vi.mock('@services/container', () => {
  return {
    container: {
      get: vi.fn().mockImplementation((identifier: symbol) => {
        const identifierMap: Record<string, keyof typeof mockServiceInstances> = {
          'Symbol(Workspace)': 'workspace',
          'Symbol(WorkspaceView)': 'workspaceView',
          'Symbol(Window)': 'window',
          'Symbol(Native)': 'native',
          'Symbol(Wiki)': 'wiki',
          'Symbol(Auth)': 'auth',
          'Symbol(Context)': 'context',
          'Symbol(Preference)': 'preference',
          'Symbol(ExternalAPI)': 'externalAPI',
          'Symbol(AgentInstance)': 'workspace',
          'Symbol(AgentDefinition)': 'agentDefinition',
        };
        const serviceKey = identifierMap[identifier.toString()];
        return serviceKey ? mockServiceInstances[serviceKey] : (() => {
          throw new Error(`Unknown service identifier: ${identifier.toString()}`);
        })();
      }),
    },
    serviceInstances: mockServiceInstances,
  };
});

// Export shared service instances for use in tests
export { mockServiceInstances };
