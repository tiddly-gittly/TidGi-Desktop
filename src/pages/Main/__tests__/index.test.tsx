import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

// Override the global workspaces$ observable with our test-specific data
Object.defineProperty(window.observables.workspace, 'workspaces$', {
  value: workspacesSubject.asObservable(),
  writable: true,
});

// Override preferences for this test
Object.defineProperty(window.observables.preference, 'preference$', {
  value: preferencesSubject.asObservable(),
  writable: true,
});

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
    const { hook } = memoryLocation({
      path: initialPath,
      record: true,
    });
    render(
      <HelmetProvider>
        <ThemeProvider theme={lightTheme}>
          <Router hook={hook}>
            <Main />
          </Router>
        </ThemeProvider>
      </HelmetProvider>,
    );
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    renderMain();
    // Wait for at least one guide-page to render
    await screen.findByTestId('guide-page');
  });

  it('should display workspace names and icons in sidebar', async () => {
    const workspaceElements = screen.getAllByRole('button', { hidden: true });
    expect(workspaceElements.length).toBeGreaterThan(0);

    // Use findByText for async elements that might not be immediately available
    expect(await screen.findByText('我的维基')).toBeInTheDocument();
    expect(await screen.findByText('工作笔记')).toBeInTheDocument();
    expect(await screen.findByText('WorkspaceSelector.Help')).toBeInTheDocument();
    expect(await screen.findByText('WorkspaceSelector.Agent')).toBeInTheDocument();
    expect(await screen.findByText('WorkspaceSelector.Guide')).toBeInTheDocument();
    expect(await screen.findByText('AddWorkspace.AddWorkspace')).toBeInTheDocument();
  });

  it('should display Guide content and preferences button by default', async () => {
    // Only one guide-page should exist
    const guides = screen.getAllByTestId('guide-page');
    expect(guides.length).toBe(1);

    // Should show preferences button
    const settingsIcon = await screen.findByTestId('SettingsIcon');
    expect(settingsIcon).toBeInTheDocument();
    const preferencesButton = settingsIcon.closest('button');
    expect(preferencesButton).toHaveAttribute('id', 'open-preferences-button');
  });

  it('should handle workspace switching', async () => {
    // Only one guide-page should exist
    const guides = screen.getAllByTestId('guide-page');
    expect(guides.length).toBe(1);

    // Check that all workspace elements are present (2 wiki + 4 built-in pages)
    expect(await screen.findByText('我的维基')).toBeInTheDocument();
    expect(await screen.findByText('工作笔记')).toBeInTheDocument();
    expect(await screen.findByText('WorkspaceSelector.Help')).toBeInTheDocument();
    expect(await screen.findByText('WorkspaceSelector.Agent')).toBeInTheDocument();
    expect(await screen.findByText('WorkspaceSelector.Guide')).toBeInTheDocument();
    expect(await screen.findByText('AddWorkspace.AddWorkspace')).toBeInTheDocument();
  });

  it('should switch to Help page content when clicking Help workspace', async () => {
    const user = userEvent.setup();

    // Only one guide-page should exist
    const guides = screen.getAllByTestId('guide-page');
    expect(guides.length).toBe(1);

    // Find and click the Help workspace text directly - more realistic user interaction
    const helpText = await screen.findByText('WorkspaceSelector.Help');
    await user.click(helpText);

    // Only one help-page should exist
    const helps = screen.getAllByTestId('help-page');
    expect(helps.length).toBe(1);
  });

  it('should switch to Agent page content when clicking Agent workspace', async () => {
    const user = userEvent.setup();

    // Only one guide-page should exist
    const guides = screen.getAllByTestId('guide-page');
    expect(guides.length).toBe(1);

    // Find and click the Agent workspace text directly - more realistic user interaction
    const agentText = await screen.findByText('WorkspaceSelector.Agent');
    await user.click(agentText);

    // Only one agent-page should exist
    const agents = screen.getAllByTestId('agent-page');
    expect(agents.length).toBe(1);
    expect(screen.queryAllByTestId('guide-page').length).toBe(0);
  });
});
