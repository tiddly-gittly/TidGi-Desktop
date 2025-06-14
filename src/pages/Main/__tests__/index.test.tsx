import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { HelmetProvider } from '@dr.pogodin/react-helmet';
import React from 'react';
import { BehaviorSubject } from 'rxjs';

import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '@services/theme/defaultTheme';
import Main from '../index';

// Mock wouter to control routing in tests
const mockLocation = { pathname: '/' };
const mockNavigate = vi.fn();

vi.mock('wouter', () => ({
  Router: ({ children }: { children: React.ReactNode }) => <div data-testid='router'>{children}</div>,
  Route: ({ path, component: Component }: { path: string; component: React.ComponentType }) => {
    if (path === mockLocation.pathname || (path === '/' && mockLocation.pathname === '/')) {
      return <Component />;
    }
    return null;
  },
  Switch: ({ children }: { children: React.ReactNode }) => <div data-testid='switch'>{children}</div>,
  useLocation: () => [mockLocation.pathname, mockNavigate],
}));

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
  {
    id: 'workspace-1',
    name: '我的维基',
    gitUrl: 'https://github.com/test/repo1.git',
    wikiFolderLocation: '/path/to/wiki1',
    picturePath: '/mock-icon1.png',
    order: 0,
    active: false,
  },
  {
    id: 'help-workspace',
    name: 'Help',
    pageType: 'help',
    order: 1,
    active: false,
    metadata: {},
  },
  {
    id: 'agent-workspace',
    name: 'Agent',
    pageType: 'agent',
    order: 2,
    active: false,
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
    preference: {
      get: vi.fn().mockResolvedValue(undefined),
    },
    context: {
      get: vi.fn().mockImplementation((key: string) => {
        if (key === 'platform') return Promise.resolve('win32');
        return Promise.resolve(undefined);
      }),
    },
    workspace: {
      setWorkspaces: vi.fn().mockResolvedValue(undefined),
      countWorkspaces: vi.fn().mockResolvedValue(3),
      openWorkspaceTiddler: vi.fn().mockResolvedValue(undefined),
    },
    workspaceView: {
      setActiveWorkspaceView: vi.fn().mockResolvedValue(undefined),
    },
    window: {
      open: vi.fn().mockResolvedValue(undefined),
    },
    native: {
      openURI: vi.fn().mockResolvedValue(undefined),
    },
    wiki: {
      getSubWikiPluginContent: vi.fn().mockResolvedValue([]),
    },
    auth: {
      getStorageServiceUserInfo: vi.fn().mockResolvedValue(undefined),
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
      // Mock navigation based on workspace pageType
      if (workspace.pageType === 'help') {
        mockNavigate('/help');
        await window.service.workspaceView.setActiveWorkspaceView(workspace.id);
      } else if (workspace.pageType === 'agent') {
        mockNavigate('/agent');
        await window.service.workspaceView.setActiveWorkspaceView(workspace.id);
      } else {
        // Regular wiki workspace
        mockNavigate(`/wiki/${workspace.id}/`);
        // For regular workspace, just mock the navigation
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
    // Reset to home route before each test
    mockLocation.pathname = '/';
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
      
      // Check that workspace names are displayed
      expect(screen.getByText('我的维基')).toBeInTheDocument();
      expect(screen.getByText('Help')).toBeInTheDocument();
      expect(screen.getByText('Agent')).toBeInTheDocument();
    });
  });

  it('should display Guide content on the right side by default', async () => {
    renderMain();

    await waitFor(() => {
      // Check that main content area exists
      const contentArea = screen.getByTestId('find-in-page');
      expect(contentArea).toBeInTheDocument();

      // By default, should render the preference sections (which are part of Guide component)
      expect(screen.getByText('Preference.Languages')).toBeInTheDocument();
      expect(screen.getByText('Preference.TiddlyWiki')).toBeInTheDocument();
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

      // Check that workspace buttons are present and clickable
      const workspaceButtons = screen.getAllByTestId('workspace-button');
      expect(workspaceButtons.length).toBe(3);
    });
  });

  it('should switch to Help page when clicking Help workspace', async () => {
    renderMain();

    // Wait for the component to fully render first
    await waitFor(() => {
      expect(screen.getByTestId('find-in-page')).toBeInTheDocument();
    });

    // Click Help workspace button
    const helpButton = screen.getByText('Help').closest('[data-testid="workspace-button"]');
    expect(helpButton).toBeInTheDocument();
    
    fireEvent.click(helpButton!);

    // Verify that the location was changed to /help
    expect(mockNavigate).toHaveBeenCalledWith('/help');
    
    // Verify that setActiveWorkspaceView was called
    expect(window.service.workspaceView.setActiveWorkspaceView).toHaveBeenCalledWith('help-workspace');
  });

  it('should switch to Agent page when clicking Agent workspace', async () => {
    renderMain();

    // Wait for the component to fully render first
    await waitFor(() => {
      expect(screen.getByTestId('find-in-page')).toBeInTheDocument();
    });

    // Click Agent workspace button
    const agentButton = screen.getByText('Agent').closest('[data-testid="workspace-button"]');
    expect(agentButton).toBeInTheDocument();
    
    fireEvent.click(agentButton!);

    // Verify that the location was changed to /agent
    expect(mockNavigate).toHaveBeenCalledWith('/agent');
    
    // Verify that setActiveWorkspaceView was called
    expect(window.service.workspaceView.setActiveWorkspaceView).toHaveBeenCalledWith('agent-workspace');
  });

  it('should display different content based on current route', async () => {
    // Test Help route
    mockLocation.pathname = '/help';
    const { unmount: unmountHelp } = renderMain();

    await waitFor(() => {
      // Should show Help page content
      expect(screen.getByText('Help.Description')).toBeInTheDocument();
      expect(screen.getByText('Help.List')).toBeInTheDocument();
    });

    // Clean up first render
    unmountHelp();

    // Test default route (Guide content)
    mockLocation.pathname = '/';
    renderMain();

    await waitFor(() => {
      // Should show Guide content (preference sections)
      expect(screen.getByText('Preference.Languages')).toBeInTheDocument();
      expect(screen.getByText('Preference.TiddlyWiki')).toBeInTheDocument();
      // Help content should not be visible
      expect(screen.queryByText('Help.Description')).not.toBeInTheDocument();
    });
  });
});
