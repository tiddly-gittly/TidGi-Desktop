import type { AIStreamResponse, IExternalAPIService } from '@/services/externalAPI/interface';
import { AgentBrowserService } from '@services/agentBrowser';
import type { IAgentBrowserService } from '@services/agentBrowser/interface';
import { AgentDefinitionService } from '@services/agentDefinition';
import { AgentInstanceService } from '@services/agentInstance';
import { container } from '@services/container';
import type { IContextService } from '@services/context/interface';
import type { IDatabaseService } from '@services/database/interface';
import type { INativeService } from '@services/native/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { SupportedStorageServices } from '@services/types';
import type { IWikiService } from '@services/wiki/interface';
import type { IWindowService } from '@services/windows/interface';
import type { IWorkspace, IWorkspaceService } from '@services/workspaces/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';
import { AgentDefinitionEntity, AgentInstanceEntity, AgentInstanceMessageEntity } from '@services/database/schema/agent';
import { DataSource } from 'typeorm';
import { Observable } from 'rxjs';
import { vi } from 'vitest';

// Mock bindServiceAndProxy to be an empty function
// This allows us to control service bindings in tests instead of using production bindings (while currently it is not called because it is called in `main.ts` and it is not executed during test.)
vi.mock('@services/libs/bindServiceAndProxy', () => ({
  bindServiceAndProxy: vi.fn(),
}));

// Create a shared in-memory SQLite database for all tests
export const testDataSource = new DataSource({
  type: 'better-sqlite3',
  database: ':memory:',
  entities: [AgentDefinitionEntity, AgentInstanceEntity, AgentInstanceMessageEntity],
  synchronize: true,
  logging: false,
});

// Initialize the test database
let isInitialized = false;

export const initializeTestDatabase = async (): Promise<void> => {
  if (!isInitialized) {
    await testDataSource.initialize();
    isInitialized = true;
  }
};

export const clearTestDatabase = async (): Promise<void> => {
  if (testDataSource.isInitialized) {
    // Clear all tables
    await testDataSource.getRepository(AgentInstanceMessageEntity).clear();
    await testDataSource.getRepository(AgentInstanceEntity).clear();
    await testDataSource.getRepository(AgentDefinitionEntity).clear();
  }
};

// Provide properly-typed default implementations so tests can use vi.fn(impl)
// Inline default implementations will be provided directly in mocked serviceInstances below

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
  database: Partial<IDatabaseService>;
} = {
  workspace: {
    countWorkspaces: vi.fn().mockResolvedValue(5),
    openWorkspaceTiddler: vi.fn().mockResolvedValue(undefined),
    // typed mocks for common methods tests will override; default returns shared fixtures
    getWorkspacesAsList: vi.fn(async () => defaultWorkspaces),
    exists: vi.fn(async (_id: string) => true),
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
    getStorageServiceUserInfo: vi.fn().mockResolvedValue(undefined),
  },
  context: {
    get: vi.fn().mockResolvedValue(undefined),
  },
  preference: {
    get: vi.fn().mockResolvedValue(undefined),
  },
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
    cancelAIRequest: vi.fn(async () => undefined),
    updateProvider: vi.fn(async () => undefined),
    deleteProvider: vi.fn(async () => undefined),
    updateDefaultAIConfig: vi.fn(async () => undefined),
    deleteFieldFromDefaultAIConfig: vi.fn(async () => undefined),
  },
  database: {
    getDatabase: vi.fn().mockResolvedValue(testDataSource),
    initializeDatabase: vi.fn(),
    closeAppDatabase: vi.fn(),
    getSetting: vi.fn(),
    setSetting: vi.fn(),
    initializeForApp: vi.fn(),
    immediatelyStoreSettingsToFile: vi.fn(),
  },
};

// Bind the shared mocks into container so real services resolved from container.get()
// will receive these mocks during tests.
container.bind(serviceIdentifier.Workspace).toConstantValue(serviceInstances.workspace);
container.bind(serviceIdentifier.WorkspaceView).toConstantValue(serviceInstances.workspaceView);
container.bind(serviceIdentifier.Window).toConstantValue(serviceInstances.window);
container.bind(serviceIdentifier.NativeService).toConstantValue(serviceInstances.native);
container.bind(serviceIdentifier.Wiki).toConstantValue(serviceInstances.wiki);
container.bind(serviceIdentifier.ExternalAPI).toConstantValue(serviceInstances.externalAPI);
container.bind(serviceIdentifier.Preference).toConstantValue(serviceInstances.preference);
container.bind(serviceIdentifier.Context).toConstantValue(serviceInstances.context);
container.bind(serviceIdentifier.Authentication).toConstantValue(serviceInstances.auth);
container.bind(serviceIdentifier.AgentDefinition).to(AgentDefinitionService).inSingletonScope();
container.bind(serviceIdentifier.AgentBrowser).to(AgentBrowserService).inSingletonScope();
container.bind(serviceIdentifier.Database).toConstantValue(serviceInstances.database);
container.bind(serviceIdentifier.AgentInstance).to(AgentInstanceService).inSingletonScope();

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
