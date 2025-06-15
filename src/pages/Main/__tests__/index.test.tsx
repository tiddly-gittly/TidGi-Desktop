import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { PageType } from '@/constants/pageTypes';
import { HelmetProvider } from '@dr.pogodin/react-helmet';
import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '@services/theme/defaultTheme';
import { BehaviorSubject } from 'rxjs';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
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

const pageTypes = [PageType.agent, PageType.help, PageType.guide, PageType.add];
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
  // Built-in page workspaces generated from pageTypes
  ...pageTypes.entries().map(([index, pageType]) => ({
    id: pageType,
    name: pageType,
    pageType,
    order: index + 2,
    metadata: {},
  })),
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
});

// Mock window.meta function
Object.defineProperty(window, 'meta', {
  value: vi.fn().mockReturnValue({
    windowName: 'main',
  }),
});

// Mock window.remote for FindInPage functionality
Object.defineProperty(window, 'remote', {
  value: {
    registerOpenFindInPage: vi.fn(),
    registerCloseFindInPage: vi.fn(),
    registerUpdateFindInPageMatches: vi.fn(),
    unregisterOpenFindInPage: vi.fn(),
    unregisterCloseFindInPage: vi.fn(),
    unregisterUpdateFindInPageMatches: vi.fn(),
  },
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

// Mock subPages to provide simple test components
vi.mock('../subPages', () => ({
  subPages: {
    Help: () => <div data-testid='help-page'>Help Page Content</div>,
    Guide: () => <div data-testid='guide-page'>Guide Page Content</div>,
    Agent: () => <div data-testid='agent-page'>Agent Page Content</div>,
  },
}));

describe('Main Page', () => {
  // Helper function to render Main with specific route (defaults to '/' for normal tests)
  const renderMain = (initialPath: string = '/') => {
    const { hook, navigate } = memoryLocation({
      path: initialPath,
      record: true,
    });
    const renderResult = render(
      <HelmetProvider>
        <ThemeProvider theme={lightTheme}>
          <Router hook={hook}>
            <Main />
          </Router>
        </ThemeProvider>
      </HelmetProvider>,
    );
    return { ...renderResult, navigate };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    renderMain();
  });

  it('should display workspace names and icons in sidebar', async () => {
    await waitFor(() => {
      const workspaceElements = screen.getAllByRole('button', { hidden: true });
      expect(workspaceElements.length).toBeGreaterThan(0);
      expect(screen.getByText('我的维基')).toBeInTheDocument();
      expect(screen.getByText('工作笔记')).toBeInTheDocument();
      expect(screen.getByText('WorkspaceSelector.Help')).toBeInTheDocument();
      expect(screen.getByText('WorkspaceSelector.Agent')).toBeInTheDocument();
      expect(screen.getByText('WorkspaceSelector.Guide')).toBeInTheDocument();
      expect(screen.getByText('AddWorkspace.AddWorkspace')).toBeInTheDocument();
    });
  });

  it('should display Guide content and preferences button by default', async () => {
    await waitFor(() => {
      // Should display Guide page content by default
      expect(screen.getByText('Guide Page Content')).toBeInTheDocument();
      // Should show preferences button
      const settingsIcon = screen.getByTestId('SettingsIcon');
      expect(settingsIcon).toBeInTheDocument();
      const preferencesButton = settingsIcon.closest('button');
      expect(preferencesButton).toHaveAttribute('id', 'open-preferences-button');
    });
  });

  it('should handle workspace switching', async () => {
    await waitFor(() => {
      // Wait for main content to be loaded by checking for the Guide page content
      expect(screen.getByText('Guide Page Content')).toBeInTheDocument();
      // Check that all workspace elements are present (2 wiki + 4 built-in pages)
      expect(screen.getByText('我的维基')).toBeInTheDocument();
      expect(screen.getByText('工作笔记')).toBeInTheDocument();
      expect(screen.getByText('WorkspaceSelector.Help')).toBeInTheDocument();
      expect(screen.getByText('WorkspaceSelector.Agent')).toBeInTheDocument();
      expect(screen.getByText('WorkspaceSelector.Guide')).toBeInTheDocument();
      expect(screen.getByText('AddWorkspace.AddWorkspace')).toBeInTheDocument();
    });
  });

  it('should switch to Help page content when clicking Help workspace', async () => {
    await waitFor(() => {
      // Initially should show Guide page content
      expect(screen.getByText('Guide Page Content')).toBeInTheDocument();
    });
    // Find and click the Help workspace text directly - let event bubble up
    const helpText = screen.getByText('WorkspaceSelector.Help');
    fireEvent.click(helpText, { bubbles: true });
    await waitFor(() => {
      expect(screen.getByText('Help Page Content')).toBeInTheDocument();
    });
  });

  it('should switch to Agent page content when clicking Agent workspace', async () => {
    await waitFor(() => {
      // Initially should show Guide page content
      expect(screen.getByText('Guide Page Content')).toBeInTheDocument();
    });
    // Find and click the Agent workspace text directly - let event bubble up
    const agentText = screen.getByText('WorkspaceSelector.Agent');
    fireEvent.click(agentText, { bubbles: true });
    await waitFor(() => {
      // Should now show Agent page content instead of Guide page content
      expect(screen.getByText('Agent Page Content')).toBeInTheDocument();
      expect(screen.queryByText('Guide Page Content')).not.toBeInTheDocument();
    });
  });
});
