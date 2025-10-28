import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useGitLogData } from '../useGitLogData';

// Mock window.service
const mockWorkspace = {
  id: 'test-workspace',
  name: 'Test Workspace',
  wikiFolderLocation: '/test/path',
  gitUrl: 'https://github.com/test/repo',
};

const mockGitLogResult = {
  entries: [
    {
      hash: 'abc123',
      parents: [],
      branch: 'main',
      message: 'Initial commit',
      committerDate: '2024-01-01T00:00:00Z',
      author: {
        name: 'Test User',
        email: 'test@example.com',
      },
    },
  ],
  currentBranch: 'main',
  totalCount: 1,
};

vi.mock('../../services/workspace', () => ({
  getWorkspace: vi.fn(),
}));

interface IWindowMock {
  meta: () => { workspaceID?: string };
  service: {
    git?: {
      getGitLog: () => Promise<typeof mockGitLogResult>;
    };
    workspace?: {
      get: (id: string) => Promise<typeof mockWorkspace | null>;
    };
  };
}

describe('useGitLogData', () => {
  it('should load git log data successfully', async () => {
    // Setup mocks
    global.window = {
      meta: vi.fn(() => ({ workspaceID: 'test-workspace' })),
      service: {
        workspace: {
          get: vi.fn().mockResolvedValue(mockWorkspace),
        },
        git: {
          getGitLog: vi.fn().mockResolvedValue(mockGitLogResult),
        },
      },
    } as unknown as Window & typeof globalThis & IWindowMock;

    const { result } = renderHook(() => useGitLogData());

    // Initially loading
    expect(result.current.loading).toBe(true);
    expect(result.current.entries).toEqual([]);

    // Wait for data to load
    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false);
    }, { timeout: 3000 });

    // Check results
    expect(result.current.entries).toEqual(mockGitLogResult.entries);
    expect(result.current.currentBranch).toBe('main');
    expect(result.current.workspaceInfo).toEqual(mockWorkspace);
    expect(result.current.error).toBeNull();
  });

  it('should handle error when workspace not found', async () => {
    global.window = {
      meta: vi.fn(() => ({ workspaceID: 'test-workspace' })),
      service: {
        workspace: {
          get: vi.fn().mockResolvedValue(null),
        },
      },
    } as unknown as Window & typeof globalThis & IWindowMock;

    const { result } = renderHook(() => useGitLogData());

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false);
    }, { timeout: 3000 });

    expect(result.current.error).toBe('Workspace not found');
  });

  it('should handle error when no workspace ID provided', async () => {
    global.window = {
      meta: vi.fn(() => ({})),
      service: {},
    } as unknown as Window & typeof globalThis & IWindowMock;

    const { result } = renderHook(() => useGitLogData());

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false);
    }, { timeout: 3000 });

    expect(result.current.error).toBe('No workspace ID provided');
  });

  it('should handle git log fetch error', async () => {
    global.window = {
      meta: vi.fn(() => ({ workspaceID: 'test-workspace' })),
      service: {
        workspace: {
          get: vi.fn().mockResolvedValue(mockWorkspace),
        },
        git: {
          getGitLog: vi.fn().mockRejectedValue(new Error('Git error')),
        },
      },
    } as unknown as Window & typeof globalThis & IWindowMock;

    const { result } = renderHook(() => useGitLogData());

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false);
    }, { timeout: 3000 });

    expect(result.current.error).toBe('Git error');
    expect(result.current.entries).toEqual([]);
  });
});
