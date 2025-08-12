import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';

const mockServiceInstances = {
  workspace: {
    countWorkspaces: vi.fn().mockResolvedValue(5),
    openWorkspaceTiddler: vi.fn().mockResolvedValue(undefined),
    concatPrompt: vi.fn().mockReturnValue(
      new BehaviorSubject({
        processedPrompts: [],
        flatPrompts: [
          { role: 'system', content: 'You are a helpful assistant' },
          { role: 'user', content: 'Hello' },
        ],
        step: 'complete',
        progress: 1,
        isComplete: true,
      }),
    ),
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
};

export const container = {
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
    };
    const serviceKey = identifierMap[identifier.toString()];
    return serviceKey ? mockServiceInstances[serviceKey] : (() => {
      throw new Error(`Unknown service identifier: ${identifier.toString()}`);
    })();
  }),
};
export const serviceInstances = mockServiceInstances;
