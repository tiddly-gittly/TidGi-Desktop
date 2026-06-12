import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ThemeProvider } from '@mui/material/styles';
import { BehaviorSubject } from 'rxjs';

import { defaultPreferences } from '@services/preferences/defaultPreferences';
import { sectionById } from '@services/preferences/definitions/registry';
import type { IPreferences } from '@services/preferences/interface';
import { lightTheme } from '@services/theme/defaultTheme';
import { SupportedStorageServices } from '@services/types';
import type { IWorkspace } from '@services/workspaces/interface';
import { registerCustomSections } from '../../registerCustomSections';
import { TidGiMiniWindowAdvancedSettingsItem, TidGiMiniWindowMainToggleItem } from '../TidGiMiniWindowItems';

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
];

const createMockPreference = (overrides: Partial<IPreferences> = {}): IPreferences => ({
  ...defaultPreferences,
  ...overrides,
});

describe('TidGiMiniWindow custom items', () => {
  let preferenceSubject: BehaviorSubject<IPreferences | undefined>;

  beforeEach(() => {
    vi.clearAllMocks();

    preferenceSubject = new BehaviorSubject<IPreferences | undefined>(
      createMockPreference({
        tidgiMiniWindow: true,
        tidgiMiniWindowSyncWorkspaceWithMainWindow: false,
      }),
    );

    Object.defineProperty(window.observables.preference, 'preference$', {
      value: preferenceSubject.asObservable(),
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window.service.context, 'get', {
      value: vi.fn().mockResolvedValue('win32'),
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window.service.workspace, 'getWorkspacesAsList', {
      value: vi.fn().mockResolvedValue(mockWorkspaces),
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window.service.preference, 'set', {
      value: vi.fn(async (key: string, value: unknown) => {
        const currentPreference = preferenceSubject.value;
        if (currentPreference) {
          preferenceSubject.next({ ...currentPreference, [key]: value });
        }
      }),
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window.service.native, 'registerKeyboardShortcut', {
      value: vi.fn().mockResolvedValue(undefined),
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window.service.native, 'unregisterKeyboardShortcut', {
      value: vi.fn().mockResolvedValue(undefined),
      writable: true,
      configurable: true,
    });
  });

  it('keeps tidgiMiniWindow section schema-driven after custom registration', () => {
    registerCustomSections();
    expect(sectionById.get('tidgiMiniWindow')?.CustomSectionComponent).toBeUndefined();
  });

  it('renders the main toggle item', async () => {
    render(
      <TestWrapper>
        <TidGiMiniWindowMainToggleItem />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Preference.AttachToTaskbar')).toBeInTheDocument();
    });
  });

  it('renders advanced settings and updates sync preference', async () => {
    render(
      <TestWrapper>
        <TidGiMiniWindowAdvancedSettingsItem />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Preference.TidgiMiniWindowShowTitleBar')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Preference.TidgiMiniWindowFixedWorkspace').length).toBeGreaterThan(0);

    const user = userEvent.setup();
    const syncSwitch = screen.getByTestId('tidgi-mini-window-sync-workspace-switch').querySelector('input[type="checkbox"]');
    if (!syncSwitch) throw new Error('Sync switch not found');
    await user.click(syncSwitch);

    expect(window.service.preference.set).toHaveBeenCalledWith('tidgiMiniWindowSyncWorkspaceWithMainWindow', true);
  });
});
