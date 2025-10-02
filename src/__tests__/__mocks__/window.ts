import { AgentInstanceService } from '@services/agentInstance';
import { AgentInstanceMessage } from '@services/agentInstance/interface';
import { AgentPromptDescription } from '@services/agentInstance/promptConcat/promptConcatSchema';
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
    },
    updater: {
      updaterMetaData$: new BehaviorSubject(undefined).asObservable(),
    },
    auth: {
      userInfo$: new BehaviorSubject(undefined).asObservable(),
    },
    agentInstance: {
      concatPrompt: vi.fn((promptDescription: Pick<AgentPromptDescription, 'handlerConfig'>, messages: AgentInstanceMessage[]) => {
        const agentInstanceService = container.get<AgentInstanceService>(serviceIdentifier.AgentInstance);
        // Initialize handlers (plugins and built-in handlers) before calling concatPrompt
        // We need to wrap this in an Observable since concatPrompt returns an Observable
        return new Observable((observer) => {
          const initAndCall = async () => {
            try {
              // Need to register plugins first. In test environment, this needs to be called manually. While in real
              // environment, this is handled in `main.ts` when app start.
              await agentInstanceService.initializeHandlers();
              const resultObservable = agentInstanceService.concatPrompt(promptDescription, messages);
              // Subscribe to the result and forward to our observer
              resultObservable.subscribe(observer);
            } catch (_error: unknown) {
              // Log but keep test mocks resilient

              console.warn(`Error while inserting dom node in react widget, this might be cause by use transclude widget for the wikitext contains widget.`, _error);
              void _error;
              observer.error(_error);
            }
          };
          void initAndCall();
        });
      }),
    },
  },
});

// Mock window.service
Object.defineProperty(window, 'service', {
  writable: true,
  value: serviceInstances,
});
