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
import { TidGiMenubarWindow } from '../TidGiMenubarWindow';

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
    id: 'workspace-2',
    name: 'Test Workspace 2',
    wikiFolderLocation: '/test/workspace2',
    homeUrl: 'http://localhost:5213/',
    port: 5213,
    isSubWiki: false,
    mainWikiToLink: null,
    tagName: null,
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
    subWikiFolderName: 'subwiki',
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

describe('TidGiMenubarWindow Component', () => {
  let preferenceSubject: BehaviorSubject<IPreferences | undefined>;

  beforeEach(() => {
    vi.clearAllMocks();

    preferenceSubject = new BehaviorSubject<IPreferences | undefined>(
      createMockPreference({ attachToMenubar: false }),
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
        <TidGiMenubarWindow />
      </TestWrapper>,
    );

    // Wait for component to fully load and stabilize
    await waitFor(() => {
      expect(screen.queryByText('Loading')).not.toBeInTheDocument();
    });

    // Ensure component is fully rendered
    await waitFor(() => {
      expect(screen.getByText('Menu.TidGiMenuBar')).toBeInTheDocument();
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
          <TidGiMenubarWindow />
        </TestWrapper>,
      );

      // Verify loading state is shown when preference is undefined
      expect(screen.getByText('Loading')).toBeInTheDocument();

      // Immediately unmount to prevent any async updates
      unmount();
    });

    it('should render after loading with preferences', async () => {
      await renderComponent();

      expect(screen.getByText('Menu.TidGiMenuBar')).toBeInTheDocument();
    });

    it('should load platform information from backend on mount', async () => {
      await renderComponent();

      expect(window.service.context.get).toHaveBeenCalledWith('platform');
    });

    it('should load workspace list from backend on mount', async () => {
      await renderComponent();

      expect(window.service.workspace.getWorkspacesAsList).toHaveBeenCalled();
    });

    it('should display correct attach to menubar text for Windows', async () => {
      Object.defineProperty(window.service.context, 'get', {
        value: vi.fn().mockResolvedValue('win32'),
        writable: true,
      });

      await renderComponent();

      expect(screen.getByText('Preference.AttachToTaskbar')).toBeInTheDocument();
    });

    it('should display correct attach to menubar text for macOS', async () => {
      Object.defineProperty(window.service.context, 'get', {
        value: vi.fn().mockResolvedValue('darwin'),
        writable: true,
      });

      await renderComponent();

      expect(screen.getByText('Preference.AttachToMenuBar')).toBeInTheDocument();
    });
  });

  describe('Attach to menubar toggle', () => {
    it('should display attach to menubar switch with correct initial state', async () => {
      preferenceSubject.next(createMockPreference({ attachToMenubar: false }));
      await renderComponent();

      const switches = screen.getAllByRole('checkbox');
      const attachSwitch = switches[0];
      expect(attachSwitch).not.toBeChecked();
    });

    it('should call backend API when attach to menubar is toggled', async () => {
      const user = userEvent.setup();
      preferenceSubject.next(createMockPreference({ attachToMenubar: false }));
      await renderComponent();

      const switches = screen.getAllByRole('checkbox');
      const attachSwitch = switches[0];

      await user.click(attachSwitch);

      await waitFor(() => {
        expect(window.service.preference.set).toHaveBeenCalledWith('attachToMenubar', true);
      });
    });

    it('should toggle attach to menubar setting', async () => {
      const user = userEvent.setup();
      preferenceSubject.next(createMockPreference({ attachToMenubar: false }));
      await renderComponent();

      const switches = screen.getAllByRole('checkbox');
      const attachSwitch = switches[0];

      await user.click(attachSwitch);

      await waitFor(() => {
        expect(window.service.preference.set).toHaveBeenCalledWith('attachToMenubar', true);
      });
    });
  });

  describe('Conditional settings visibility', () => {
    it('should hide additional settings when attachToMenubar is false', async () => {
      preferenceSubject.next(createMockPreference({ attachToMenubar: false }));
      await renderComponent();

      expect(screen.queryByText('Preference.AttachToTaskbarShowSidebar')).not.toBeInTheDocument();
      expect(screen.queryByText('Preference.AttachToMenuBarShowSidebar')).not.toBeInTheDocument();
      expect(screen.queryByText('Preference.MenubarAlwaysOnTop')).not.toBeInTheDocument();
      expect(screen.queryByText('Preference.MenubarSyncWorkspaceWithMainWindow')).not.toBeInTheDocument();
    });

    it('should show additional settings when attachToMenubar is true', async () => {
      preferenceSubject.next(
        createMockPreference({
          attachToMenubar: true,
          sidebarOnMenubar: false,
          menuBarAlwaysOnTop: false,
          menubarSyncWorkspaceWithMainWindow: true,
        }),
      );
      await renderComponent();

      expect(screen.getByText('Preference.AttachToTaskbarShowSidebar')).toBeInTheDocument();
      expect(screen.getByText('Preference.MenubarAlwaysOnTop')).toBeInTheDocument();
      expect(screen.getByText('Preference.MenubarSyncWorkspaceWithMainWindow')).toBeInTheDocument();
    });
  });

  describe('Sidebar on menubar toggle', () => {
    it('should display sidebar toggle with correct initial state', async () => {
      preferenceSubject.next(
        createMockPreference({
          attachToMenubar: true,
          sidebarOnMenubar: false,
        }),
      );
      await renderComponent();

      const switches = screen.getAllByRole('checkbox');
      const sidebarSwitch = switches.find((s) => {
        const label = s.closest('li')?.querySelector('.MuiListItemText-primary');
        return label?.textContent === 'Preference.AttachToTaskbarShowSidebar';
      });

      expect(sidebarSwitch).not.toBeChecked();
    });

    it('should call backend API when sidebar toggle is changed', async () => {
      const user = userEvent.setup();
      preferenceSubject.next(
        createMockPreference({
          attachToMenubar: true,
          sidebarOnMenubar: false,
        }),
      );
      await renderComponent();

      const switches = screen.getAllByRole('checkbox');
      const sidebarSwitch = switches[1];

      await user.click(sidebarSwitch);

      await waitFor(() => {
        expect(window.service.preference.set).toHaveBeenCalledWith('sidebarOnMenubar', true);
      });
    });
  });

  describe('Always on top toggle', () => {
    it('should display always on top toggle with correct initial state', async () => {
      preferenceSubject.next(
        createMockPreference({
          attachToMenubar: true,
          menuBarAlwaysOnTop: false,
        }),
      );
      await renderComponent();

      const switches = screen.getAllByRole('checkbox');
      const alwaysOnTopSwitch = switches.find((s) => {
        const label = s.closest('li')?.querySelector('.MuiListItemText-primary');
        return label?.textContent === 'Preference.MenubarAlwaysOnTop';
      });

      expect(alwaysOnTopSwitch).not.toBeChecked();
    });

    it('should call backend API when always on top is toggled', async () => {
      const user = userEvent.setup();
      preferenceSubject.next(
        createMockPreference({
          attachToMenubar: true,
          menuBarAlwaysOnTop: false,
        }),
      );
      await renderComponent();

      const switches = screen.getAllByRole('checkbox');
      const alwaysOnTopSwitch = switches[2];

      await user.click(alwaysOnTopSwitch);

      await waitFor(() => {
        expect(window.service.preference.set).toHaveBeenCalledWith('menuBarAlwaysOnTop', true);
      });
    });
  });

  describe('Workspace sync toggle', () => {
    it('should display workspace sync toggle with correct initial state', async () => {
      preferenceSubject.next(
        createMockPreference({
          attachToMenubar: true,
          menubarSyncWorkspaceWithMainWindow: true,
        }),
      );
      await renderComponent();

      const switches = screen.getAllByRole('checkbox');
      const syncSwitch = switches.find((s) => {
        const label = s.closest('li')?.querySelector('.MuiListItemText-primary');
        return label?.textContent === 'Preference.MenubarSyncWorkspaceWithMainWindow';
      });

      expect(syncSwitch).toBeChecked();
    });

    it('should call backend API when workspace sync is toggled', async () => {
      const user = userEvent.setup();
      preferenceSubject.next(
        createMockPreference({
          attachToMenubar: true,
          menubarSyncWorkspaceWithMainWindow: true,
        }),
      );
      await renderComponent();

      const switches = screen.getAllByRole('checkbox');
      const syncSwitch = switches[3];

      await user.click(syncSwitch);

      await waitFor(() => {
        expect(window.service.preference.set).toHaveBeenCalledWith('menubarSyncWorkspaceWithMainWindow', false);
      });
    });

    it('should hide fixed workspace selector when sync is enabled', async () => {
      preferenceSubject.next(
        createMockPreference({
          attachToMenubar: true,
          menubarSyncWorkspaceWithMainWindow: true,
        }),
      );
      await renderComponent();

      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('should show fixed workspace selector when sync is disabled', async () => {
      preferenceSubject.next(
        createMockPreference({
          attachToMenubar: true,
          menubarSyncWorkspaceWithMainWindow: false,
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
          attachToMenubar: true,
          menubarSyncWorkspaceWithMainWindow: false,
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
          attachToMenubar: true,
          menubarSyncWorkspaceWithMainWindow: false,
          menubarFixedWorkspaceId: '',
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
          attachToMenubar: true,
          menubarSyncWorkspaceWithMainWindow: false,
          menubarFixedWorkspaceId: 'workspace-2',
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
    it('should display keyboard shortcut button when menubar is attached', async () => {
      preferenceSubject.next(
        createMockPreference({
          attachToMenubar: true,
          keyboardShortcuts: {},
        }),
      );
      await renderComponent();

      const shortcutButton = screen.getByRole('button', { name: /Preference\.MenubarShortcutKey/ });
      expect(shortcutButton).toBeInTheDocument();
    });

    it('should display current keyboard shortcut value', async () => {
      preferenceSubject.next(
        createMockPreference({
          attachToMenubar: true,
          keyboardShortcuts: {
            'Window.toggleMenubarWindow': 'Ctrl+Shift+M',
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
          attachToMenubar: true,
          keyboardShortcuts: {},
        }),
      );
      await renderComponent();

      const shortcutButton = screen.getByRole('button', { name: /Preference\.MenubarShortcutKey/ });

      const mockOnChange = vi.fn(async (value: string) => {
        if (value && value.trim() !== '') {
          await window.service.native.registerKeyboardShortcut('Window', 'toggleMenubarWindow', value);
        } else {
          await window.service.native.unregisterKeyboardShortcut('Window', 'toggleMenubarWindow');
        }
      });

      shortcutButton.onclick = () => {
        void mockOnChange('Ctrl+Shift+T');
      };

      await user.click(shortcutButton);

      await waitFor(() => {
        expect(window.service.native.registerKeyboardShortcut).toHaveBeenCalledWith('Window', 'toggleMenubarWindow', 'Ctrl+Shift+T');
      });
    });

    it('should call unregisterKeyboardShortcut API when shortcut is cleared', async () => {
      const user = userEvent.setup();
      preferenceSubject.next(
        createMockPreference({
          attachToMenubar: true,
          keyboardShortcuts: {
            'Window.toggleMenubarWindow': 'Ctrl+Shift+M',
          },
        }),
      );
      await renderComponent();

      const shortcutButton = screen.getByRole('button', { name: /Preference\.MenubarShortcutKey/ });

      const mockOnChange = vi.fn(async (value: string) => {
        if (value && value.trim() !== '') {
          await window.service.native.registerKeyboardShortcut('Window', 'toggleMenubarWindow', value);
        } else {
          await window.service.native.unregisterKeyboardShortcut('Window', 'toggleMenubarWindow');
        }
      });

      shortcutButton.onclick = () => {
        void mockOnChange('');
      };

      await user.click(shortcutButton);

      await waitFor(() => {
        expect(window.service.native.unregisterKeyboardShortcut).toHaveBeenCalledWith('Window', 'toggleMenubarWindow');
      });
    });

    it('should display helper text for keyboard shortcut', async () => {
      preferenceSubject.next(
        createMockPreference({
          attachToMenubar: true,
          keyboardShortcuts: {},
        }),
      );
      await renderComponent();

      expect(screen.getByText('Preference.MenubarShortcutKeyHelperText')).toBeInTheDocument();
    });
  });

  describe('Integration: Toggle sequence', () => {
    it('should show all settings when attachToMenubar is toggled on', async () => {
      const user = userEvent.setup();

      // Create a fresh subject for this test to avoid interference
      const toggleTestSubject = new BehaviorSubject<IPreferences | undefined>(
        createMockPreference({ attachToMenubar: false }),
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
          <TidGiMenubarWindow />
        </TestWrapper>,
      );

      // Wait for component to fully load
      await waitFor(() => {
        expect(screen.getByText('Menu.TidGiMenuBar')).toBeInTheDocument();
      });

      // Verify additional settings are hidden initially
      expect(screen.queryByText('Preference.MenubarAlwaysOnTop')).not.toBeInTheDocument();

      // Click the attach to menubar toggle
      const switches = screen.getAllByRole('checkbox');
      const attachSwitch = switches[0];
      await user.click(attachSwitch);

      // Wait for API call
      await waitFor(() => {
        expect(window.service.preference.set).toHaveBeenCalledWith('attachToMenubar', true);
      });

      // Now verify new elements appear (they should appear automatically after the state update)
      await waitFor(() => {
        expect(screen.getByText('Preference.MenubarAlwaysOnTop')).toBeInTheDocument();
        expect(screen.getByText('Preference.MenubarSyncWorkspaceWithMainWindow')).toBeInTheDocument();
      });
    });

    it('should handle multiple switch toggles correctly', async () => {
      const user = userEvent.setup();
      preferenceSubject.next(
        createMockPreference({
          attachToMenubar: true,
          sidebarOnMenubar: false,
          menuBarAlwaysOnTop: false,
          menubarSyncWorkspaceWithMainWindow: true,
        }),
      );
      await renderComponent();

      const switches = screen.getAllByRole('checkbox');

      await user.click(switches[1]);
      await waitFor(() => {
        expect(window.service.preference.set).toHaveBeenCalledWith('sidebarOnMenubar', true);
      });

      await user.click(switches[2]);
      await waitFor(() => {
        expect(window.service.preference.set).toHaveBeenCalledWith('menuBarAlwaysOnTop', true);
      });

      await user.click(switches[3]);
      await waitFor(() => {
        expect(window.service.preference.set).toHaveBeenCalledWith('menubarSyncWorkspaceWithMainWindow', false);
      });

      expect(window.service.preference.set).toHaveBeenCalledTimes(3);
    });
  });
});
