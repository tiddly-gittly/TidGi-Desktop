import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { serviceInstances } from './services-container';

// Mock window.meta
globalThis.window = globalThis.window || {};
Object.defineProperty(window, 'meta', {
  writable: true,
  value: vi.fn(() => ({
    windowName: 'main',
  })),
});

// Mock window.remote
Object.defineProperty(window, 'remote', {
  writable: true,
  value: {
    registerOpenFindInPage: vi.fn(),
    registerCloseFindInPage: vi.fn(),
    registerUpdateFindInPageMatches: vi.fn(),
    unregisterOpenFindInPage: vi.fn(),
    unregisterCloseFindInPage: vi.fn(),
    unregisterUpdateFindInPageMatches: vi.fn(),
    registerWindowMetaUpdated: vi.fn(),
    unregisterWindowMetaUpdated: vi.fn(),
    registerAskAIWithSelection: vi.fn(),
    unregisterAskAIWithSelection: vi.fn(),
  },
});

// Mock window.observables
Object.defineProperty(window, 'observables', {
  writable: true,
  value: {
    preference: {
      preference$: new BehaviorSubject({}).asObservable(),
    },
    workspace: {
      workspaces$: new BehaviorSubject([]).asObservable(),
      groups$: new BehaviorSubject({}).asObservable(),
    },
    updater: {
      updaterMetaData$: new BehaviorSubject(undefined).asObservable(),
    },
    auth: {
      userInfo$: new BehaviorSubject(undefined).asObservable(),
    },
    externalAPI: {
      defaultConfig$: new BehaviorSubject({
        default: { providerId: 'openai', modelId: 'gpt-4', parameters: { temperature: 0.7, topP: 0.95 } },
      }).asObservable(),
      providerAccounts$: new BehaviorSubject([]).asObservable(),
    },
    agentInstance: {},
    deviceNetwork: {
      cloudStatus$: serviceInstances.deviceNetwork.cloudStatus$!.asObservable(),
      devices$: serviceInstances.deviceNetwork.devices$!.asObservable(),
      pairingSessions$: serviceInstances.deviceNetwork.pairingSessions$!.asObservable(),
    },
  },
});

// Mock window.service
Object.defineProperty(window, 'service', {
  writable: true,
  value: serviceInstances,
});
