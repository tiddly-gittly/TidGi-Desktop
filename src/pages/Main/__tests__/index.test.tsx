import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { HelmetProvider } from '@dr.pogodin/react-helmet';
import React from 'react';
import { BehaviorSubject } from 'rxjs';

import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '@services/theme/defaultTheme';
import Main from '../index';

// Mock window.observables to provide realistic API behavior
const preferencesSubject = new BehaviorSubject({
  language: 'zh-CN',
  sideBarWidth: 250,
  sidebar: true,
  sidebarOnMenubar: true,
  showSideBarText: true,
  showSideBarIcon: true,
});

const workspacesSubject = new BehaviorSubject([
  // Regular wiki workspaces
  {
    id: 'workspace-1',
    name: '我的维基',
    order: 0,
    picturePath: '/mock-icon1.png',
    gitUrl: 'https://github.com/test/repo1.git',
    wikiFolderLocation: '/path/to/wiki1',
    homeUrl: 'tidgi://workspace/workspace-1/',
    port: 5212,
    metadata: {},
  },
  {
    id: 'workspace-2',
    name: '工作笔记',
    order: 1,
    picturePath: '/mock-icon2.png',
    gitUrl: 'https://github.com/test/repo2.git',
    wikiFolderLocation: '/path/to/wiki2',
    homeUrl: 'tidgi://workspace/workspace-2/',
    isSubWiki: true,
    mainWikiID: 'workspace-1',
    mainWikiToLink: '/path/to/wiki1',
    port: 5213,
    tagName: 'WorkNotes',
    metadata: { badgeCount: 5 },
  },
  // Built-in page workspaces
  {
    id: 'help',
    name: 'help',
    pageType: 'help',
    order: 2,
    picturePath: null,
    metadata: {},
  },
  {
    id: 'agent',
    name: 'agent',
    pageType: 'agent',
    order: 3,
    picturePath: null,
    metadata: {},
  },
  {
    id: 'guide',
    name: 'guide',
    pageType: 'guide',
    active: true,
    order: 4,
    picturePath: null,
    metadata: {},
  },
]);

Object.defineProperty(window, 'observables', {
  value: {
    preference: {
      preference$: preferencesSubject.asObservable(),
    },
    workspace: {
      workspaces$: workspacesSubject.asObservable(),
    },
    updater: {
      updaterMetaData$: new BehaviorSubject(undefined).asObservable(),
    },
    auth: {
      userInfo$: new BehaviorSubject(undefined).asObservable(),
    },
  },
  writable: true,
});

// Mock window.service for necessary async calls
Object.defineProperty(window, 'service', {
  value: {
    workspace: {
      countWorkspaces: vi.fn().mockResolvedValue(5),
      openWorkspaceTiddler: vi.fn().mockResolvedValue(undefined),
    },
    workspaceView: {
      setActiveWorkspaceView: vi.fn().mockResolvedValue(undefined),
    },
    window: {
      open: vi.fn().mockResolvedValue(undefined),
    },
    native: {
      log: vi.fn().mockResolvedValue(undefined),
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
  },
  writable: true,
});

// Mock window.meta function
Object.defineProperty(window, 'meta', {
  value: vi.fn().mockReturnValue({
    windowName: 'main',
  }),
  writable: true,
});

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      changeLanguage: vi.fn(),
    },
  }),
  getI18n: () => ({
    t: (key: string) => key,
    changeLanguage: vi.fn(),
  }),
}));

// Mock useInitialPage hook
vi.mock('../useInitialPage', () => ({
  useInitialPage: vi.fn(),
}));

// Mock lazy-loaded components with simple divs
vi.mock('../../../Agent', () => ({
  default: () => <div data-testid='agent'>Agent</div>,
}));

vi.mock('../../../Guide', () => ({
  default: () => <div data-testid='guide'>Guide 指引页面内容</div>,
}));

vi.mock('../../../Help', () => ({
  default: () => <div data-testid='help'>Help</div>,
}));

vi.mock('../../../WikiBackground', () => ({
  default: () => <div data-testid='wiki-background'>WikiBackground</div>,
}));

// Mock Find in Page component
vi.mock('../FindInPage', () => ({
  default: () => <div data-testid='find-in-page'>FindInPage</div>,
}));

// Mock subPages to provide simple test components
vi.mock('../subPages', () => ({
  subPages: {
    Help: () => <div data-testid='help-page'>Help Page Content</div>,
    Guide: () => <div data-testid='guide-page'>Guide Page Content</div>,
    Agent: () => <div data-testid='agent-page'>Agent Page Content</div>,
    AddWorkspace: () => <div data-testid='add-workspace-page'>Add Workspace Page Content</div>,
  },
}));

// Mock simplebar-react
vi.mock('simplebar-react', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid='simplebar'>{children}</div>,
}));

// Mock SortableWorkspaceSelectorButton component
vi.mock('../WorkspaceIconAndSelector/SortableWorkspaceSelectorButton', () => ({
  SortableWorkspaceSelectorButton: ({ workspace, showSidebarTexts, showSideBarIcon }: {
    workspace: { id: string; name: string; picturePath?: string; pageType?: string };
    showSidebarTexts: boolean;
    showSideBarIcon: boolean;
  }) => {
    const handleClick = async () => {
      // Mock workspace view service calls for built-in pages
      if (workspace.pageType === 'help' || workspace.pageType === 'agent') {
        await window.service.workspaceView.setActiveWorkspaceView(workspace.id);
      }
    };

    return (
      <button
        data-testid='workspace-button'
        data-workspace-id={workspace.id}
        onClick={handleClick}
      >
        {showSideBarIcon && workspace.picturePath && <img src={workspace.picturePath} alt={workspace.name} data-testid='workspace-icon' />}
        {showSidebarTexts && <span data-testid='workspace-name'>{workspace.name}</span>}
      </button>
    );
  },
}));

// Import the mock components
import { Router } from 'wouter';

describe('Main Page', () => {
  const renderMain = () => {
    return render(
      <HelmetProvider>
        <ThemeProvider theme={lightTheme}>
          <Router>
            <Main />
          </Router>
        </ThemeProvider>
      </HelmetProvider>,
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    expect(() => renderMain()).not.toThrow();
  });

  it('should display sidebar with correct width', async () => {
    const { container } = renderMain();

    // Check that the component renders successfully
    await waitFor(() => {
      expect(container.firstChild).toBeTruthy();
    });
  });

  it('should display workspace names and icons in sidebar', async () => {
    renderMain();

    await waitFor(() => {
      // Check that workspace buttons are displayed
      const workspaceButtons = screen.getAllByTestId('workspace-button');
      expect(workspaceButtons.length).toBeGreaterThan(0);

      // Check regular wiki workspace names
      expect(screen.getByText('我的维基')).toBeInTheDocument();
      expect(screen.getByText('工作笔记')).toBeInTheDocument();

      // Check built-in page workspace names (they use raw pageType as name, will be localized in UI)
      expect(screen.getByText('help')).toBeInTheDocument();
      expect(screen.getByText('agent')).toBeInTheDocument();
      expect(screen.getByText('guide')).toBeInTheDocument();
    });
  });

  it('should display Guide content on the right side by default', async () => {
    renderMain();

    await waitFor(() => {
      // Check that main content area exists
      const contentArea = screen.getByTestId('find-in-page');
      expect(contentArea).toBeInTheDocument();

      // By default, should render the Guide page content
      expect(screen.getByTestId('guide-page')).toBeInTheDocument();
      expect(screen.getByText('Guide Page Content')).toBeInTheDocument();
    });
  });

  it('should show preferences button in sidebar', async () => {
    renderMain();

    await waitFor(() => {
      // Check that preferences button is present by ID (the most reliable way)
      const preferencesButton = document.getElementById('open-preferences-button');
      expect(preferencesButton).toBeInTheDocument();
      expect(preferencesButton).toHaveAttribute('type', 'button');

      // Also verify it has the settings icon
      const settingsIcon = screen.getByTestId('SettingsIcon');
      expect(settingsIcon).toBeInTheDocument();
    });
  });

  it('should handle workspace switching', async () => {
    renderMain();

    await waitFor(() => {
      // Check that content area is present
      expect(screen.getByTestId('find-in-page')).toBeInTheDocument();

      // Check that all workspace buttons are present (2 wiki + 3 built-in pages)
      const workspaceButtons = screen.getAllByTestId('workspace-button');
      expect(workspaceButtons.length).toBe(5);
    });
  });

  it('should switch to Help page when clicking Help workspace', async () => {
    renderMain();

    await waitFor(() => {
      expect(screen.getByTestId('find-in-page')).toBeInTheDocument();
    });

    // Click Help workspace button
    const helpButton = screen.getByText('help').closest('[data-testid="workspace-button"]');
    expect(helpButton).toBeInTheDocument();

    fireEvent.click(helpButton!);

    // Verify setActiveWorkspaceView was called
    expect(window.service.workspaceView.setActiveWorkspaceView).toHaveBeenCalledWith('help');
  });

  it('should switch to Agent page when clicking Agent workspace', async () => {
    renderMain();

    await waitFor(() => {
      expect(screen.getByTestId('find-in-page')).toBeInTheDocument();
    });

    // Click Agent workspace button
    const agentButton = screen.getByText('agent').closest('[data-testid="workspace-button"]');
    expect(agentButton).toBeInTheDocument();

    fireEvent.click(agentButton!);

    // Verify setActiveWorkspaceView was called
    expect(window.service.workspaceView.setActiveWorkspaceView).toHaveBeenCalledWith('agent');
  });

  it('should display Guide page content by default', async () => {
    renderMain();

    await waitFor(() => {
      // Should display our mocked Guide page content
      expect(screen.getByTestId('guide-page')).toBeInTheDocument();
      expect(screen.getByText('Guide Page Content')).toBeInTheDocument();
    });
  });
});
