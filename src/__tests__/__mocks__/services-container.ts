import type { AIStreamResponse, IExternalAPIService } from '@/services/externalAPI/interface';
import { AgentBrowserService } from '@services/agentBrowser';
import { AgentDefinitionService } from '@services/agentDefinition';
import { AgentInstanceService } from '@services/agentInstance';
import { container } from '@services/container';
import type { IContextService } from '@services/context/interface';
import { DatabaseService } from '@services/database';
import { ExternalAPIService } from '@services/externalAPI';
import type { INativeService } from '@services/native/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { SupportedStorageServices } from '@services/types';
import type { IWikiService } from '@services/wiki/interface';
import { WikiEmbeddingService } from '@services/wikiEmbedding';
import type { IWindowService } from '@services/windows/interface';
import type { IWorkspace, IWorkspaceService } from '@services/workspaces/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';
import { Observable } from 'rxjs';
import { vi } from 'vitest';

// Mock bindServiceAndProxy to be an empty function
// This allows us to control service bindings in tests instead of using production bindings (while currently it is not called because it is called in `main.ts` and it is not executed during test.)
vi.mock('@services/libs/bindServiceAndProxy', () => ({
  bindServiceAndProxy: vi.fn(),
}));

export const serviceInstances: {
  workspace: Partial<IWorkspaceService>;
  workspaceView: Partial<IWorkspaceViewService>;
  window: Partial<IWindowService>;
  native: Partial<INativeService>;
  wiki: Partial<IWikiService>;
  auth: Record<string, unknown>;
  context: Partial<IContextService>;
  preference: Partial<IPreferenceService>;
  externalAPI: Partial<IExternalAPIService>;
} = {
  workspace: {
    countWorkspaces: vi.fn().mockResolvedValue(5),
    openWorkspaceTiddler: vi.fn().mockResolvedValue(undefined),
    // typed mocks for common methods tests will override; default returns shared fixtures
    getWorkspacesAsList: vi.fn(async () => defaultWorkspaces),
    exists: vi.fn(async (_id: string) => true),
    get: vi.fn(async (id: string) => defaultWorkspaces.find(w => w.id === id) || defaultWorkspaces[0]),
    // agent-instance functionality is provided under `agentInstance` key
  },
  workspaceView: {
    // provide a properly-typed implementation wrapped by vi.fn
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
    // generic wikiOperationInServer mock: keep simple, allow test-specific overrides
    wikiOperationInServer: vi.fn().mockResolvedValue([]) as IWikiService['wikiOperationInServer'],
  },
  auth: {
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    getStorageServiceUserInfo: vi.fn().mockResolvedValue(undefined),
    getUserInfos: vi.fn().mockResolvedValue({ userName: '' }),
    setUserInfos: vi.fn(),
  },
  context: {
    get: vi.fn().mockResolvedValue(undefined),
  },
  preference: (() => {
    const store: Record<string, unknown> = {};
    return {
      get: vi.fn(async (key: string) => store[key]),
      set: vi.fn(async (key: string, value: unknown) => {
        store[key] = value;
      }),
      resetWithConfirm: vi.fn(async () => undefined),
    } as Partial<IPreferenceService>;
  })(),
  externalAPI: {
    getAIConfig: vi.fn(async () => ({ api: { model: 'test-model', provider: 'test-provider' }, modelParameters: {} })),
    getAIProviders: vi.fn(async () => []),
    generateFromAI: vi.fn(async function*() {
      // harmless await for linter
      await Promise.resolve();
      yield { requestId: 'r0', content: '', status: 'start' } as AIStreamResponse;
      return;
    }),
    streamFromAI: vi.fn((_messages, _config) =>
      new Observable<AIStreamResponse>((subscriber) => {
        subscriber.next({ requestId: 'r1', content: 'ok', status: 'start' });
        subscriber.next({ requestId: 'r1', content: 'ok', status: 'done' });
        subscriber.complete();
      })
    ),
    generateEmbeddings: vi.fn(async () => ({
      requestId: 'test-request',
      embeddings: [[0.1, 0.2, 0.3, 0.4]], // Default 4D embedding
      model: 'test-embedding-model',
      object: 'embedding',
      usage: {
        prompt_tokens: 10,
        total_tokens: 10,
      },
      status: 'done' as const,
    })),
    cancelAIRequest: vi.fn(async () => undefined),
    updateProvider: vi.fn(async () => undefined),
    deleteProvider: vi.fn(async () => undefined),
    updateDefaultAIConfig: vi.fn(async () => undefined),
    deleteFieldFromDefaultAIConfig: vi.fn(async () => undefined),
  },
};

// Bind the shared mocks into container so real services resolved from container.get()
// will receive these mocks during tests.
container.bind(serviceIdentifier.Workspace).toConstantValue(serviceInstances.workspace);
container.bind(serviceIdentifier.WorkspaceView).toConstantValue(serviceInstances.workspaceView);
container.bind(serviceIdentifier.Window).toConstantValue(serviceInstances.window);
container.bind(serviceIdentifier.NativeService).toConstantValue(serviceInstances.native);
container.bind(serviceIdentifier.Wiki).toConstantValue(serviceInstances.wiki);
container.bind(serviceIdentifier.ExternalAPI).to(ExternalAPIService).inSingletonScope();
container.bind(serviceIdentifier.Preference).toConstantValue(serviceInstances.preference);
container.bind(serviceIdentifier.Context).toConstantValue(serviceInstances.context);
container.bind(serviceIdentifier.Authentication).toConstantValue(serviceInstances.auth);
container.bind(serviceIdentifier.AgentDefinition).to(AgentDefinitionService).inSingletonScope();
container.bind(serviceIdentifier.AgentBrowser).to(AgentBrowserService).inSingletonScope();
// Bind real DatabaseService instead of mock
container.bind(serviceIdentifier.Database).to(DatabaseService).inSingletonScope();
container.bind(serviceIdentifier.AgentInstance).to(AgentInstanceService).inSingletonScope();
container.bind(serviceIdentifier.WikiEmbedding).to(WikiEmbeddingService).inSingletonScope();

// Shared workspace fixtures used by many tests
const defaultWorkspaces: IWorkspace[] = [
  {
    id: 'test-wiki-1',
    name: 'Test Wiki 1',
    wikiFolderLocation: '/path/to/test-wiki-1',
    homeUrl: 'http://localhost:5212/',
    port: 5212,
    isSubWiki: false,
    mainWikiToLink: null,
    tagName: null,
    lastUrl: null,
    active: true,
    hibernated: false,
    order: 0,
    disableNotifications: false,
    backupOnInterval: false,
    disableAudio: false,
    enableHTTPAPI: false,
    excludedPlugins: [],
    gitUrl: null,
    hibernateWhenUnused: false,
    readOnlyMode: false,
    storageService: SupportedStorageServices.local,
    subWikiFolderName: 'subwiki',
    syncOnInterval: false,
    syncOnStartup: false,
    tokenAuth: false,
    transparentBackground: false,
    userName: '',
    picturePath: null,
  },
  {
    id: 'test-wiki-2',
    name: 'Test Wiki 2',
    wikiFolderLocation: '/path/to/test-wiki-2',
    homeUrl: 'http://localhost:5213/',
    port: 5213,
    isSubWiki: false,
    mainWikiToLink: null,
    tagName: null,
    lastUrl: null,
    active: true,
    hibernated: false,
    order: 1,
    disableNotifications: false,
    backupOnInterval: false,
    disableAudio: false,
    enableHTTPAPI: false,
    excludedPlugins: [],
    gitUrl: null,
    hibernateWhenUnused: false,
    readOnlyMode: false,
    storageService: SupportedStorageServices.local,
    subWikiFolderName: 'subwiki',
    syncOnInterval: false,
    syncOnStartup: false,
    tokenAuth: false,
    transparentBackground: false,
    userName: '',
    picturePath: null,
  },
];
