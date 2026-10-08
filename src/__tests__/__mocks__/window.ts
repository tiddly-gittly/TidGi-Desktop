import { AgentInstanceService } from '@services/agentInstance';
import { container } from '@services/container';
import serviceIdentifier from '@services/serviceIdentifier';
import { BehaviorSubject, Observable } from 'rxjs';
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
    agentInstance: {
      concatPromptPreview: vi.fn((input: Parameters<AgentInstanceService['concatPromptPreview']>[0]) => {
        const agentInstanceService = container.get<AgentInstanceService>(serviceIdentifier.AgentInstance);
        return new Observable<ReturnType<AgentInstanceService['concatPromptPreview']> extends Observable<infer T> ? T : never>((observer) => {
          const initAndCall = async () => {
            try {
              await agentInstanceService.initializeFrameworks();
              agentInstanceService.concatPromptPreview(input).subscribe(observer);
            } catch (_error: unknown) {
              console.warn(`Error while inserting dom node in react widget, this might be cause by use transclude widget for the wikitext contains widget.`, _error);
              observer.error(_error);
            }
          };
          void initAndCall();
        });
      }),
    },
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
