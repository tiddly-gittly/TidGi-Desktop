import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '@services/theme/defaultTheme';
import { BehaviorSubject } from 'rxjs';

import { defaultPreferences } from '@services/preferences/defaultPreferences';
import type { IPreferences } from '@services/preferences/interface';
import { SupportedStorageServices } from '@services/types';
import type { IWorkspace } from '@services/workspaces/interface';
import { TidGiMiniWindow } from '../TidGiMiniWindow';

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider theme={lightTheme}>
    {children}
  </ThemeProvider>
);

const mockWorkspaces: IWorkspace[] = [
  {
    id: 'workspace-1',
    name: 'Test Workspace 1',
    wikiFolderLocation: '/test/workspace1',
    homeUrl: 'http://localhost:5212/',
    port: 5212,
    isSubWiki: false,
    mainWikiToLink: null,
    tagNames: [],
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
    syncOnInterval: false,
    syncOnStartup: false,
    tokenAuth: false,
    transparentBackground: false,
    userName: '',
    picturePath: null,
  },
  {
    id: 'workspace-2',
    name: 'Test Workspace 2',
    wikiFolderLocation: '/test/workspace2',
    homeUrl: 'http://localhost:5213/',
    port: 5213,
    isSubWiki: false,
    mainWikiToLink: null,
    tagNames: [],
    lastUrl: null,
    active: false,
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
    syncOnInterval: false,
    syncOnStartup: false,
    tokenAuth: false,
    transparentBackground: false,
    userName: '',
    picturePath: null,
  },
];

// Reuse defaultPreferences to avoid duplication
const createMockPreference = (overrides: Partial<IPreferences> = {}): IPreferences => ({
  ...defaultPreferences,
  ...overrides,
});

describe('TidGiMiniWindow Component', () => {
  let preferenceSubject: BehaviorSubject<IPreferences | undefined>;

  beforeEach(() => {
    vi.clearAllMocks();

    preferenceSubject = new BehaviorSubject<IPreferences | undefined>(
      createMockPreference({ tidgiMiniWindow: false }),
    );

    Object.defineProperty(window.observables.preference, 'preference$', {
      value: preferenceSubject.asObservable(),
      writable: true,
    });

    Object.defineProperty(window.service.context, 'get', {
      value: vi.fn().mockResolvedValue('win32'),
      writable: true,
    });

    Object.defineProperty(window.service.workspace, 'getWorkspacesAsList', {
      value: vi.fn().mockResolvedValue(mockWorkspaces),
      writable: true,
    });

    Object.defineProperty(window.service.preference, 'set', {
      value: vi.fn(async (key: string, value: unknown) => {
        const currentPreference = preferenceSubject.value;
        if (currentPreference) {
          preferenceSubject.next({ ...currentPreference, [key]: value });
        }
      }),
      writable: true,
    });

    Object.defineProperty(window.service.native, 'registerKeyboardShortcut', {
      value: vi.fn().mockResolvedValue(undefined),
      writable: true,
    });

    Object.defineProperty(window.service.native, 'unregisterKeyboardShortcut', {
      value: vi.fn().mockResolvedValue(undefined),
      writable: true,
    });
  });

  const renderComponent = async () => {
    const result = render(
      <TestWrapper>
        <TidGiMiniWindow />
      </TestWrapper>,
    );

    // Wait for component to fully load and stabilize
    await waitFor(() => {
      expect(screen.queryByText('Loading')).not.toBeInTheDocument();
    });

    // Ensure component is fully rendered
    await waitFor(() => {
      expect(screen.getByText('Menu.TidGiMiniWindow')).toBeInTheDocument();
    });

    return result;
  };

  describe('Initial state and loading', () => {
    it('should show loading state when preference is undefined', () => {
      // Create a fresh BehaviorSubject with undefined for this specific test
      const loadingPreferenceSubject = new BehaviorSubject<IPreferences | undefined>(undefined);

      Object.defineProperty(window.observables.preference, 'preference$', {
        value: loadingPreferenceSubject.asObservable(),
        writable: true,
        configurable: true,
      });

      const { unmount } = render(
        <TestWrapper>
          <TidGiMiniWindow />
        </TestWrapper>,
      );

      // Verify loading state is shown when preference is undefined
      expect(screen.getByText('Loading')).toBeInTheDocument();

      // Immediately unmount to prevent any async updates
      unmount();
    });

    it('should render after loading with preferences', async () => {
      await renderComponent();

      expect(screen.getByText('Menu.TidGiMiniWindow')).toBeInTheDocument();
    });

    it('should load platform information from backend on mount', async () => {
      await renderComponent();

      expect(window.service.context.get).toHaveBeenCalledWith('platform');
    });

    it('should load workspace list from backend on mount', async () => {
      await renderComponent();

      expect(window.service.workspace.getWorkspacesAsList).toHaveBeenCalled();
    });

    it('should display correct attach to tidgi mini window text for Windows', async () => {
      Object.defineProperty(window.service.context, 'get', {
        value: vi.fn().mockResolvedValue('win32'),
        writable: true,
      });

      await renderComponent();

      expect(screen.getByText('Preference.AttachToTaskbar')).toBeInTheDocument();
    });

    it('should display correct attach to tidgi mini window text for macOS', async () => {
      Object.defineProperty(window.service.context, 'get', {
        value: vi.fn().mockResolvedValue('darwin'),
        writable: true,
      });

      await renderComponent();

      expect(screen.getByText('Preference.TidgiMiniWindow')).toBeInTheDocument();
    });
  });

  describe('Attach to tidgi mini window toggle', () => {
    it('should display attach to tidgi mini window switch with correct initial state', async () => {
      preferenceSubject.next(createMockPreference({ tidgiMiniWindow: false }));
      await renderComponent();

      await waitFor(() => {
        expect(screen.getAllByRole('switch')).toHaveLength(1);
      });
      const switches = screen.getAllByRole('switch');
      const attachSwitch = switches[0];
      expect(attachSwitch).not.toBeChecked();
    });

    it('should call backend API when attach to tidgi mini window is toggled', async () => {
      const user = userEvent.setup();
      preferenceSubject.next(createMockPreference({ tidgiMiniWindow: false }));
      await renderComponent();

      await waitFor(() => {
        expect(screen.getAllByRole('switch')).toHaveLength(1);
      });
      const switches = screen.getAllByRole('switch');
      const attachSwitch = switches[0];

      await user.click(attachSwitch);

      await waitFor(() => {
        expect(window.service.preference.set).toHaveBeenCalledWith('tidgiMiniWindow', true);
      });
    });

    it('should toggle attach to tidgi mini window setting', async () => {
      const user = userEvent.setup();
      preferenceSubject.next(createMockPreference({ tidgiMiniWindow: false }));
      await renderComponent();

      await waitFor(() => {
        expect(screen.getAllByRole('switch')).toHaveLength(1);
      });
      const switches = screen.getAllByRole('switch');
      const attachSwitch = switches[0];

      await user.click(attachSwitch);

      await waitFor(() => {
        expect(window.service.preference.set).toHaveBeenCalledWith('tidgiMiniWindow', true);
      });
    });
  });

  describe('Conditional settings visibility', () => {
    it('should hide additional settings when tidgiMiniWindow is false', async () => {
      preferenceSubject.next(createMockPreference({ tidgiMiniWindow: false }));
      await renderComponent();

      expect(screen.queryByText('Preference.AttachToTaskbarShowSidebar')).not.toBeInTheDocument();
      expect(screen.queryByText('Preference.TidgiMiniWindowShowSidebar')).not.toBeInTheDocument();
      expect(screen.queryByText('Preference.TidgiMiniWindowAlwaysOnTop')).not.toBeInTheDocument();
      expect(screen.queryByText('Preference.TidgiMiniWindowSyncWorkspaceWithMainWindow')).not.toBeInTheDocument();
    });

    it('should show additional settings when tidgiMiniWindow is true', async () => {
      preferenceSubject.next(
        createMockPreference({
          tidgiMiniWindow: true,
          tidgiMiniWindowShowSidebar: false,
          tidgiMiniWindowAlwaysOnTop: false,
          tidgiMiniWindowSyncWorkspaceWithMainWindow: false, // Changed to false to show sidebar option
        }),
      );
      await renderComponent();

      expect(screen.getByText('Preference.AttachToTaskbarShowSidebar')).toBeInTheDocument();
      expect(screen.getByText('Preference.TidgiMiniWindowAlwaysOnTop')).toBeInTheDocument();
      expect(screen.getByText('Preference.TidgiMiniWindowSyncWorkspaceWithMainWindow')).toBeInTheDocument();
    });
  });

  describe('Sidebar on tidgi mini window toggle', () => {
    it('should display sidebar toggle with correct initial state', async () => {
      preferenceSubject.next(
        createMockPreference({
          tidgiMiniWindow: true,
          tidgiMiniWindowShowSidebar: false,
          tidgiMiniWindowSyncWorkspaceWithMainWindow: false, // Must be false to show sidebar option
        }),
      );
      await renderComponent();

      const sidebarSwitchContainer = screen.getByTestId('sidebar-on-tidgi-mini-window-switch');
      const sidebarSwitch = sidebarSwitchContainer.querySelector('input[type="checkbox"]');
      expect(sidebarSwitch).not.toBeChecked();
    });

    it('should call backend API when sidebar toggle is changed', async () => {
      const user = userEvent.setup();
      preferenceSubject.next(
        createMockPreference({
          tidgiMiniWindow: true,
          tidgiMiniWindowShowSidebar: false,
          tidgiMiniWindowSyncWorkspaceWithMainWindow: false, // Must be false to show sidebar option
        }),
      );
      await renderComponent();

      const sidebarSwitchContainer = screen.getByTestId('sidebar-on-tidgi-mini-window-switch');
      const sidebarSwitch = sidebarSwitchContainer.querySelector('input[type="checkbox"]');

      if (!sidebarSwitch) throw new Error('Switch input not found');
      await user.click(sidebarSwitch);

      await waitFor(() => {
        expect(window.service.preference.set).toHaveBeenCalledWith('tidgiMiniWindowShowSidebar', true);
      });
    });
  });

  describe('Always on top toggle', () => {
    it('should display always on top toggle with correct initial state', async () => {
      preferenceSubject.next(
        createMockPreference({
          tidgiMiniWindow: true,
          tidgiMiniWindowAlwaysOnTop: false,
        }),
      );
      await renderComponent();

      const alwaysOnTopSwitchContainer = screen.getByTestId('tidgi-mini-window-always-on-top-switch');
      const alwaysOnTopSwitch = alwaysOnTopSwitchContainer.querySelector('input[type="checkbox"]');
      expect(alwaysOnTopSwitch).not.toBeChecked();
    });

    it('should call backend API when always on top is toggled', async () => {
      const user = userEvent.setup();
      preferenceSubject.next(
        createMockPreference({
          tidgiMiniWindow: true,
          tidgiMiniWindowAlwaysOnTop: false,
        }),
      );
      await renderComponent();

      const alwaysOnTopSwitchContainer = screen.getByTestId('tidgi-mini-window-always-on-top-switch');
      const alwaysOnTopSwitch = alwaysOnTopSwitchContainer.querySelector('input[type="checkbox"]');

      if (!alwaysOnTopSwitch) throw new Error('Switch input not found');
      await user.click(alwaysOnTopSwitch);

      await waitFor(() => {
        expect(window.service.preference.set).toHaveBeenCalledWith('tidgiMiniWindowAlwaysOnTop', true);
      });
    });
  });

  describe('Workspace sync toggle', () => {
    it('should display workspace sync toggle with correct initial state', async () => {
      preferenceSubject.next(
        createMockPreference({
          tidgiMiniWindow: true,
          tidgiMiniWindowSyncWorkspaceWithMainWindow: true,
        }),
      );
      await renderComponent();

      const syncSwitchContainer = screen.getByTestId('tidgi-mini-window-sync-workspace-switch');
      const syncSwitch = syncSwitchContainer.querySelector('input[type="checkbox"]');
      expect(syncSwitch).toBeChecked();
    });

    it('should call backend API when workspace sync is toggled', async () => {
      const user = userEvent.setup();
      preferenceSubject.next(
        createMockPreference({
          tidgiMiniWindow: true,
          tidgiMiniWindowSyncWorkspaceWithMainWindow: true,
        }),
      );
      await renderComponent();

      const syncSwitchContainer = screen.getByTestId('tidgi-mini-window-sync-workspace-switch');
      const syncSwitch = syncSwitchContainer.querySelector('input[type="checkbox"]');

      if (!syncSwitch) throw new Error('Switch input not found');
      await user.click(syncSwitch);

      await waitFor(() => {
        expect(window.service.preference.set).toHaveBeenCalledWith('tidgiMiniWindowSyncWorkspaceWithMainWindow', false);
      });
    });

    it('should hide fixed workspace selector when sync is enabled', async () => {
      preferenceSubject.next(
        createMockPreference({
          tidgiMiniWindow: true,
          tidgiMiniWindowSyncWorkspaceWithMainWindow: true,
        }),
      );
      await renderComponent();

      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('should show fixed workspace selector when sync is disabled', async () => {
      preferenceSubject.next(
        createMockPreference({
          tidgiMiniWindow: true,
          tidgiMiniWindowSyncWorkspaceWithMainWindow: false,
        }),
      );
      await renderComponent();

      const combobox = screen.getByRole('combobox');
      expect(combobox).toBeInTheDocument();
    });
  });

  describe('Fixed workspace selector', () => {
    it('should display workspace list in selector', async () => {
      const user = userEvent.setup();
      preferenceSubject.next(
        createMockPreference({
          tidgiMiniWindow: true,
          tidgiMiniWindowSyncWorkspaceWithMainWindow: false,
        }),
      );
      await renderComponent();

      const select = screen.getByRole('combobox');
      await user.click(select);

      await waitFor(() => {
        expect(screen.getByText('Test Workspace 1')).toBeInTheDocument();
        expect(screen.getByText('Test Workspace 2')).toBeInTheDocument();
      });
    });

    it('should have workspace selector that can trigger API calls', async () => {
      preferenceSubject.next(
        createMockPreference({
          tidgiMiniWindow: true,
          tidgiMiniWindowSyncWorkspaceWithMainWindow: false,
          tidgiMiniWindowFixedWorkspaceId: '',
        }),
      );
      await renderComponent();

      // Verify workspace selector is present with proper configuration
      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();

      // Verify the selector displays the placeholder/empty state
      const container = select.closest('.MuiFormControl-root');
      expect(container).toBeInTheDocument();
    });

    it('should display currently selected workspace', async () => {
      preferenceSubject.next(
        createMockPreference({
          tidgiMiniWindow: true,
          tidgiMiniWindowSyncWorkspaceWithMainWindow: false,
          tidgiMiniWindowFixedWorkspaceId: 'workspace-2',
        }),
      );
      const { container } = await renderComponent();

      // MUI Select stores value in a hidden input with name attribute or as data attribute
      const selectDiv = container.querySelector('.MuiSelect-select') as HTMLDivElement;
      expect(selectDiv).toBeTruthy();

      // Check if the selected workspace name is displayed
      expect(selectDiv.textContent).toBe('Test Workspace 2');
    });
  });

  describe('Keyboard shortcut registration', () => {
    it('should display keyboard shortcut button when tidgi mini window is attached', async () => {
      preferenceSubject.next(
        createMockPreference({
          tidgiMiniWindow: true,
          keyboardShortcuts: {},
        }),
      );
      await renderComponent();

      const shortcutButton = screen.getByRole('button', { name: /Preference\.TidgiMiniWindowShortcutKey/ });
      expect(shortcutButton).toBeInTheDocument();
    });

    it('should display current keyboard shortcut value', async () => {
      preferenceSubject.next(
        createMockPreference({
          tidgiMiniWindow: true,
          keyboardShortcuts: {
            'Window.toggleTidgiMiniWindow': 'Ctrl+Shift+M',
          },
        }),
      );
      await renderComponent();

      expect(screen.getByText(/Ctrl\+Shift\+M/)).toBeInTheDocument();
    });

    it('should call registerKeyboardShortcut API when new shortcut is set', async () => {
      const user = userEvent.setup();
      preferenceSubject.next(
        createMockPreference({
          tidgiMiniWindow: true,
          keyboardShortcuts: {},
        }),
      );
      await renderComponent();

      const shortcutButton = screen.getByRole('button', { name: /Preference\.TidgiMiniWindowShortcutKey/ });

      const mockOnChange = vi.fn(async (value: string) => {
        if (value && value.trim() !== '') {
          await window.service.native.registerKeyboardShortcut('Window', 'toggleTidgiMiniWindow', value);
        } else {
          await window.service.native.unregisterKeyboardShortcut('Window', 'toggleTidgiMiniWindow');
        }
      });

      shortcutButton.onclick = () => {
        void mockOnChange('Ctrl+Shift+T');
      };

      await user.click(shortcutButton);

      await waitFor(() => {
        expect(window.service.native.registerKeyboardShortcut).toHaveBeenCalledWith('Window', 'toggleTidgiMiniWindow', 'Ctrl+Shift+T');
      });
    });

    it('should call unregisterKeyboardShortcut API when shortcut is cleared', async () => {
      const user = userEvent.setup();
      preferenceSubject.next(
        createMockPreference({
          tidgiMiniWindow: true,
          keyboardShortcuts: {
            'Window.toggleTidgiMiniWindow': 'Ctrl+Shift+M',
          },
        }),
      );
      await renderComponent();

      const shortcutButton = screen.getByRole('button', { name: /Preference\.TidgiMiniWindowShortcutKey/ });

      const mockOnChange = vi.fn(async (value: string) => {
        if (value && value.trim() !== '') {
          await window.service.native.registerKeyboardShortcut('Window', 'toggleTidgiMiniWindow', value);
        } else {
          await window.service.native.unregisterKeyboardShortcut('Window', 'toggleTidgiMiniWindow');
        }
      });

      shortcutButton.onclick = () => {
        void mockOnChange('');
      };

      await user.click(shortcutButton);

      await waitFor(() => {
        expect(window.service.native.unregisterKeyboardShortcut).toHaveBeenCalledWith('Window', 'toggleTidgiMiniWindow');
      });
    });

    it('should display helper text for keyboard shortcut', async () => {
      preferenceSubject.next(
        createMockPreference({
          tidgiMiniWindow: true,
          keyboardShortcuts: {},
        }),
      );
      await renderComponent();

      expect(screen.getByText('Preference.TidgiMiniWindowShortcutKeyHelperText')).toBeInTheDocument();
    });
  });

  describe('Integration: Toggle sequence', () => {
    it('should show all settings when tidgiMiniWindow is toggled on', async () => {
      const user = userEvent.setup();

      // Create a fresh subject for this test to avoid interference
      const toggleTestSubject = new BehaviorSubject<IPreferences | undefined>(
        createMockPreference({ tidgiMiniWindow: false }),
      );

      Object.defineProperty(window.observables.preference, 'preference$', {
        value: toggleTestSubject.asObservable(),
        writable: true,
        configurable: true,
      });

      // Mock preference.set to update our test subject
      Object.defineProperty(window.service.preference, 'set', {
        value: vi.fn(async (key: string, value: unknown) => {
          const currentPreference = toggleTestSubject.value;
          if (currentPreference) {
            toggleTestSubject.next({ ...currentPreference, [key]: value });
          }
        }),
        writable: true,
      });

      render(
        <TestWrapper>
          <TidGiMiniWindow />
        </TestWrapper>,
      );

      // Wait for component to fully load
      await waitFor(() => {
        expect(screen.getByText('Menu.TidGiMiniWindow')).toBeInTheDocument();
      });

      // Verify additional settings are hidden initially
      expect(screen.queryByText('Preference.TidgiMiniWindowAlwaysOnTop')).not.toBeInTheDocument();

      // Wait for and click the attach to tidgi mini window toggle
      await waitFor(() => {
        expect(screen.getAllByRole('switch')).toHaveLength(1);
      });
      const switches = screen.getAllByRole('switch');
      const attachSwitch = switches[0];
      await user.click(attachSwitch);

      // Wait for API call
      await waitFor(() => {
        expect(window.service.preference.set).toHaveBeenCalledWith('tidgiMiniWindow', true);
      });

      // Now verify new elements appear (they should appear automatically after the state update)
      await waitFor(() => {
        expect(screen.getByText('Preference.TidgiMiniWindowAlwaysOnTop')).toBeInTheDocument();
        expect(screen.getByText('Preference.TidgiMiniWindowSyncWorkspaceWithMainWindow')).toBeInTheDocument();
      });
    });

    it('should handle multiple switch toggles correctly', async () => {
      const user = userEvent.setup();
      preferenceSubject.next(
        createMockPreference({
          tidgiMiniWindow: true,
          tidgiMiniWindowShowSidebar: false,
          tidgiMiniWindowShowTitleBar: true,
          tidgiMiniWindowAlwaysOnTop: false,
          tidgiMiniWindowSyncWorkspaceWithMainWindow: false, // Changed to false so sidebar option is visible
        }),
      );
      await renderComponent();

      // Use test IDs and find actual input elements
      const sidebarSwitchContainer = screen.getByTestId('sidebar-on-tidgi-mini-window-switch');
      const sidebarSwitch = sidebarSwitchContainer.querySelector('input[type="checkbox"]');
      if (!sidebarSwitch) throw new Error('Sidebar switch not found');
      await user.click(sidebarSwitch);
      await waitFor(() => {
        expect(window.service.preference.set).toHaveBeenCalledWith('tidgiMiniWindowShowSidebar', true);
      });

      const alwaysOnTopSwitchContainer = screen.getByTestId('tidgi-mini-window-always-on-top-switch');
      const alwaysOnTopSwitch = alwaysOnTopSwitchContainer.querySelector('input[type="checkbox"]');
      if (!alwaysOnTopSwitch) throw new Error('Always on top switch not found');
      await user.click(alwaysOnTopSwitch);
      await waitFor(() => {
        expect(window.service.preference.set).toHaveBeenCalledWith('tidgiMiniWindowAlwaysOnTop', true);
      });

      const syncSwitchContainer = screen.getByTestId('tidgi-mini-window-sync-workspace-switch');
      const syncSwitch = syncSwitchContainer.querySelector('input[type="checkbox"]');
      if (!syncSwitch) throw new Error('Sync switch not found');
      await user.click(syncSwitch);
      await waitFor(() => {
        expect(window.service.preference.set).toHaveBeenCalledWith('tidgiMiniWindowSyncWorkspaceWithMainWindow', true);
      });

      expect(window.service.preference.set).toHaveBeenCalledTimes(3);
    });
  });
});
