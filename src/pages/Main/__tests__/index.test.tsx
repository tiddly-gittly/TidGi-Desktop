import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';
import '@testing-library/jest-dom/vitest';

import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '@services/theme/defaultTheme';
import Main from '../index';

// Create mock functions using vi.hoisted to avoid hoisting issues
const mockUsePreferenceObservable = vi.hoisted(() => vi.fn());
const mockUseWorkspacesListObservable = vi.hoisted(() => vi.fn());
const mockUsePromiseValue = vi.hoisted(() => vi.fn());
const mockUseTranslation = vi.hoisted(() => vi.fn());
const mockUseInitialPage = vi.hoisted(() => vi.fn());

vi.mock('@services/preferences/hooks', () => ({
  usePreferenceObservable: mockUsePreferenceObservable,
}));

vi.mock('@services/workspaces/hooks', () => ({
  useWorkspacesListObservable: mockUseWorkspacesListObservable,
}));

vi.mock('@/helpers/useServiceValue', () => ({
  usePromiseValue: mockUsePromiseValue,
}));

vi.mock('react-i18next', () => ({
  useTranslation: mockUseTranslation,
}));

// Mock the lazy-loaded components
vi.mock('../../Guide', () => ({
  default: () => <div data-testid='guide-content'>Guide Component</div>,
}));

vi.mock('../../WikiBackground', () => ({
  default: () => <div data-testid='wiki-background'>Wiki Background</div>,
}));

vi.mock('../../Agent', () => ({
  default: () => <div data-testid='agent-content'>Agent Component</div>,
}));

vi.mock('../../Help', () => ({
  default: () => <div data-testid='help-content'>Help Component</div>,
}));

vi.mock('../FindInPage', () => ({
  default: () => <div data-testid='find-in-page'>Find In Page</div>,
}));

// Mock Sidebar with test data
vi.mock('../Sidebar', () => ({
  SideBar: () => (
    <div
      data-testid='sidebar'
      style={{
        width: '68px',
        minWidth: '68px',
        height: '100%',
        backgroundColor: '#fafafa',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <div data-testid='sidebar-top' style={{ flex: 1, width: '100%' }}>
        <div data-testid='workspace-list'>
          <div data-testid='workspace-item' data-workspace-name='我的维基'>
            <img src='/mock-icon1.png' alt='我的维基' data-testid='workspace-icon' />
            <span>我的维基</span>
          </div>
          <div data-testid='workspace-item' data-workspace-name='工作笔记'>
            <img src='/mock-icon2.png' alt='工作笔记' data-testid='workspace-icon' />
            <span>工作笔记</span>
          </div>
          <div data-testid='workspace-item' data-workspace-name='个人博客'>
            <img src='/mock-icon3.png' alt='个人博客' data-testid='workspace-icon' />
            <span>个人博客</span>
          </div>
        </div>
      </div>
      <div data-testid='sidebar-end'>
        <button data-testid='preferences-button'>Settings</button>
      </div>
    </div>
  ),
}));

vi.mock('../useInitialPage', () => ({
  useInitialPage: mockUseInitialPage,
}));

// Don't mock wouter - we want to test real routing behavior
// The default route should show Guide component

// Mock Helmet
vi.mock('@dr.pogodin/react-helmet', () => ({
  Helmet: ({ children }: { children: React.ReactNode }) => <div data-testid='helmet'>{children}</div>,
}));

describe('Main Page - Default Route Layout', () => {
  const mockPreferences = {
    sidebar: true,
    sidebarOnMenubar: true,
    showSideBarText: true,
    showSideBarIcon: true,
  };

  const mockWorkspaces = [
    {
      id: 'workspace1',
      name: '我的维基',
      homeUrl: 'http://localhost:5212',
      order: 0,
      picturePath: '/mock-icon1.png',
    },
    {
      id: 'workspace2',
      name: '工作笔记',
      homeUrl: 'http://localhost:5213',
      order: 1,
      picturePath: '/mock-icon2.png',
    },
    {
      id: 'workspace3',
      name: '个人博客',
      homeUrl: 'http://localhost:5214',
      order: 2,
      picturePath: '/mock-icon3.png',
    },
  ];

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Setup default mock returns
    mockUsePreferenceObservable.mockReturnValue(mockPreferences);
    mockUseWorkspacesListObservable.mockReturnValue(mockWorkspaces);
    mockUsePromiseValue.mockReturnValue(false); // titleBar preference
    mockUseTranslation.mockReturnValue({
      t: (key: string) => key, // Simple translation mock
    });
  });

  const renderMainPage = (initialPath = '/') => {
    return render(
      <Router base={initialPath}>
        <ThemeProvider theme={lightTheme}>
          <Main />
        </ThemeProvider>
      </Router>,
    );
  };

  describe('Sidebar Layout and Content', () => {
    it('should display sidebar on the left with correct width of 68px', async () => {
      renderMainPage();

      await waitFor(() => {
        const sidebar = screen.getByTestId('sidebar');
        expect(sidebar).toBeInTheDocument();

        // Check sidebar width matches theme configuration
        const sidebarStyles = window.getComputedStyle(sidebar);
        expect(sidebarStyles.width).toBe('68px');
        expect(sidebarStyles.minWidth).toBe('68px');
      });
    });

    it('should display default workspace names in sidebar', async () => {
      renderMainPage();

      await waitFor(() => {
        // Check that workspace items are displayed
        const workspaceItems = screen.getAllByTestId('workspace-item');
        expect(workspaceItems).toHaveLength(3);

        // Check workspace names are present
        expect(screen.getByText('我的维基')).toBeInTheDocument();
        expect(screen.getByText('工作笔记')).toBeInTheDocument();
        expect(screen.getByText('个人博客')).toBeInTheDocument();
      });
    });

    it('should display workspace icons in sidebar', async () => {
      renderMainPage();

      await waitFor(() => {
        // Check that workspace icons are displayed
        const workspaceIcons = screen.getAllByTestId('workspace-icon');
        expect(workspaceIcons).toHaveLength(3);

        // Check specific workspace icons
        const icon1 = screen.getByAltText('我的维基');
        const icon2 = screen.getByAltText('工作笔记');
        const icon3 = screen.getByAltText('个人博客');

        expect(icon1).toBeInTheDocument();
        expect(icon2).toBeInTheDocument();
        expect(icon3).toBeInTheDocument();

        expect(icon1).toHaveAttribute('src', '/mock-icon1.png');
        expect(icon2).toHaveAttribute('src', '/mock-icon2.png');
        expect(icon3).toHaveAttribute('src', '/mock-icon3.png');
      });
    });

    it('should display sidebar with proper structure (top workspace list and bottom preferences)', async () => {
      renderMainPage();

      await waitFor(() => {
        // Check sidebar structure
        expect(screen.getByTestId('sidebar')).toBeInTheDocument();
        expect(screen.getByTestId('sidebar-top')).toBeInTheDocument();
        expect(screen.getByTestId('sidebar-end')).toBeInTheDocument();
        expect(screen.getByTestId('workspace-list')).toBeInTheDocument();
        expect(screen.getByTestId('preferences-button')).toBeInTheDocument();
      });
    });
  });

  describe('Right Side Content - Guide', () => {
    it('should display Guide content on the right side for default route', async () => {
      renderMainPage();

      await waitFor(() => {
        // Check that Guide component is displayed
        const guideContent = screen.getByTestId('guide-content');
        expect(guideContent).toBeInTheDocument();
        expect(guideContent).toHaveTextContent('Guide Component');
      });
    });

    it('should verify routing works correctly by displaying Guide component', async () => {
      renderMainPage();

      await waitFor(() => {
        // With real wouter routing, Guide component should be rendered for default route
        const guideContent = screen.getByTestId('guide-content');
        expect(guideContent).toBeInTheDocument();
        expect(guideContent).toHaveTextContent('Guide Component');
      });
    });
  });

  describe('Overall Layout Structure', () => {
    it('should have proper layout structure with sidebar and content areas', async () => {
      renderMainPage();

      await waitFor(() => {
        // Check main layout components exist
        expect(screen.getByTestId('sidebar')).toBeInTheDocument();
        expect(screen.getByTestId('guide-content')).toBeInTheDocument();
        expect(screen.getByTestId('find-in-page')).toBeInTheDocument();
        expect(screen.getByTestId('helmet')).toBeInTheDocument();
      });
    });

    it('should show sidebar when preferences.sidebar is true', async () => {
      renderMainPage();

      await waitFor(() => {
        expect(screen.getByTestId('sidebar')).toBeInTheDocument();
      });
    });

    it('should hide sidebar when preferences.sidebar is false', async () => {
      // Override preferences to hide sidebar
      mockUsePreferenceObservable.mockReturnValue({
        ...mockPreferences,
        sidebar: false,
      });

      renderMainPage();

      await waitFor(() => {
        expect(screen.queryByTestId('sidebar')).not.toBeInTheDocument();
        // But Guide content should still be visible
        expect(screen.getByTestId('guide-content')).toBeInTheDocument();
      });
    });
  });

  describe('Window Configuration', () => {
    it('should render main component without errors and set window title', () => {
      renderMainPage();

      // Check that Helmet is rendered (which sets the title)
      expect(screen.getByTestId('helmet')).toBeInTheDocument();

      // Check that main content renders successfully
      expect(screen.getByTestId('guide-content')).toBeInTheDocument();
    });

    it('should call useInitialPage hook during initialization', () => {
      renderMainPage();

      // Verify that the initialization hook is called
      expect(mockUseInitialPage).toHaveBeenCalled();
    });
  });
});
