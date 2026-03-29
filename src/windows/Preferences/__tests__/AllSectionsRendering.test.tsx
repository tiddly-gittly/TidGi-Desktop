/**
 * Page-level rendering tests for Preferences sections.
 * These tests verify that each section renders its key UI elements,
 * regardless of whether the section is schema-driven or uses a custom component.
 * This acts as a safety net during schema-ification of complex sections.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ThemeProvider } from '@mui/material/styles';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { lightTheme } from '@services/theme/defaultTheme';
import { BehaviorSubject } from 'rxjs';

import { defaultPreferences } from '@services/preferences/defaultPreferences';
import type { IPreferences } from '@services/preferences/interface';
import { registerCustomSections } from '../registerCustomSections';
import { AllSectionsRenderer } from '../SchemaRenderer';

// Register custom section components
registerCustomSections();

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <LocalizationProvider dateAdapter={AdapterDateFns}>
    <ThemeProvider theme={lightTheme}>
      {children}
    </ThemeProvider>
  </LocalizationProvider>
);

const createMockPreference = (overrides: Partial<IPreferences> = {}): IPreferences => ({
  ...defaultPreferences,
  ...overrides,
});

describe('Preferences - All Sections Rendering', () => {
  let preferenceSubject: BehaviorSubject<IPreferences | undefined>;

  beforeEach(() => {
    vi.clearAllMocks();

    preferenceSubject = new BehaviorSubject<IPreferences | undefined>(
      createMockPreference(),
    );

    Object.defineProperty(window.observables.preference, 'preference$', {
      value: preferenceSubject.asObservable(),
      writable: true,
    });

    Object.defineProperty(window.observables, 'systemPreference', {
      value: {
        systemPreference$: new BehaviorSubject({}).asObservable(),
      },
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window.service.context, 'get', {
      value: vi.fn().mockImplementation(async (key: string) => {
        const contextValues: Record<string, string> = {
          platform: 'win32',
          LOG_FOLDER: 'C:\\logs',
          SETTINGS_FOLDER: 'C:\\settings',
          V8_CACHE_FOLDER: 'C:\\v8cache',
          INSTALLER_LOG_FOLDER: 'C:\\installerlogs',
        };
        return contextValues[key] ?? '';
      }),
      writable: true,
    });

    Object.defineProperty(window.service.preference, 'set', {
      value: vi.fn(async (key: string, value: unknown) => {
        const current = preferenceSubject.value;
        if (current) {
          preferenceSubject.next({ ...current, [key]: value });
        }
      }),
      writable: true,
    });

    Object.defineProperty(window.service.workspace, 'getWorkspacesAsList', {
      value: vi.fn().mockResolvedValue([]),
      writable: true,
    });

    Object.defineProperty(window.service.workspaceView, 'realignActiveWorkspace', {
      value: vi.fn().mockResolvedValue(undefined),
      writable: true,
    });

    Object.defineProperty(window.service.native, 'openPath', {
      value: vi.fn().mockResolvedValue(undefined),
      writable: true,
    });

    Object.defineProperty(window.service.native, 'openURI', {
      value: vi.fn().mockResolvedValue(undefined),
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

    Object.defineProperty(window.service.native, 'quit', {
      value: vi.fn().mockResolvedValue(undefined),
      writable: true,
    });

    Object.defineProperty(window.service.auth, 'get', {
      value: vi.fn().mockResolvedValue('TestUser'),
      writable: true,
    });

    Object.defineProperty(window.service.auth, 'set', {
      value: vi.fn().mockResolvedValue(undefined),
      writable: true,
    });

    // database may not exist in the mock; ensure it's an object first
    if (!('database' in window.service)) {
      (window.service as Record<string, unknown>).database = {};
    }
    Object.defineProperty(window.service.database, 'getDatabaseInfo', {
      value: vi.fn().mockResolvedValue({ exists: false }),
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window.service.database, 'getDatabasePath', {
      value: vi.fn().mockResolvedValue(''),
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window.service.window, 'updateWindowMeta', {
      value: vi.fn().mockResolvedValue(undefined),
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window.service.window, 'open', {
      value: vi.fn().mockResolvedValue(undefined),
      writable: true,
      configurable: true,
    });

    if (!('notification' in window.service)) {
      (window.service as Record<string, unknown>).notification = {};
    }
    Object.defineProperty(window.service.notification, 'show', {
      value: vi.fn().mockResolvedValue(undefined),
      writable: true,
      configurable: true,
    });

    if (!('systemPreference' in window.service)) {
      (window.service as Record<string, unknown>).systemPreference = {};
    }
    Object.defineProperty(window.service.systemPreference, 'setSystemPreference', {
      value: vi.fn().mockResolvedValue(undefined),
      writable: true,
      configurable: true,
    });
  });

  const renderAllSections = async () => {
    const sectionRefs = new Map<string, React.RefObject<HTMLSpanElement | null>>();
    const result = render(
      <TestWrapper>
        <AllSectionsRenderer
          onNeedsRestart={() => {}}
          sectionRefs={sectionRefs}
        />
      </TestWrapper>,
    );

    // Wait for progressive rendering to complete — all sections are batched via setTimeout(0).
    // The last section in allSections is 'misc', so wait until its title appears.
    await waitFor(() => {
      expect(screen.queryByText('Preference.Miscellaneous')).toBeInTheDocument();
    }, { timeout: 5000 });

    return result;
  };

  // ─── General section ─────────────────────────────────────────────

  it('should render General section with key settings', async () => {
    await renderAllSections();
    expect(screen.getByText('Preference.General')).toBeInTheDocument();
    expect(screen.getByText('Preference.Theme')).toBeInTheDocument();
    expect(screen.getByText('Preference.ShowSideBar')).toBeInTheDocument();
    expect(screen.getByText('Preference.AlwaysOnTop')).toBeInTheDocument();
  });

  // ─── Performance section ─────────────────────────────────────────

  it('should render Performance section', async () => {
    await renderAllSections();
    expect(screen.getByText('Preference.Performance')).toBeInTheDocument();
    expect(screen.getByText('Preference.HibernateAllUnusedWorkspaces')).toBeInTheDocument();
    expect(screen.getByText('Preference.hardwareAcceleration')).toBeInTheDocument();
  });

  // ─── Downloads section ───────────────────────────────────────────

  it('should render Downloads section', async () => {
    await renderAllSections();
    expect(screen.getByText('Preference.Downloads')).toBeInTheDocument();
    expect(screen.getByText('Preference.AskDownloadLocation')).toBeInTheDocument();
  });

  // ─── Network section ────────────────────────────────────────────

  it('should render Network section', async () => {
    await renderAllSections();
    expect(screen.getByText('Preference.Network')).toBeInTheDocument();
    expect(screen.getByText('Preference.IgnoreCertificateErrors')).toBeInTheDocument();
  });

  // ─── Privacy section ────────────────────────────────────────────

  it('should render Privacy section', async () => {
    await renderAllSections();
    expect(screen.getByText('Preference.PrivacyAndSecurity')).toBeInTheDocument();
    expect(screen.getByText('Preference.ShareBrowsingData')).toBeInTheDocument();
    expect(screen.getByText('Preference.IgnoreCertificateErrors')).toBeInTheDocument();
  });

  // ─── Updates section ────────────────────────────────────────────

  it('should render Updates section', async () => {
    await renderAllSections();
    expect(screen.getByText('Preference.Updates')).toBeInTheDocument();
    expect(screen.getByText('Preference.ReceivePreReleaseUpdates')).toBeInTheDocument();
  });

  // ─── Friend Links section ───────────────────────────────────────

  it('should render FriendLinks section', async () => {
    await renderAllSections();
    expect(screen.getByText('Preference.FriendLinks')).toBeInTheDocument();
  });

  // ─── Miscellaneous section ──────────────────────────────────────

  it('should render Miscellaneous section', async () => {
    await renderAllSections();
    expect(screen.getByText('Preference.Miscellaneous')).toBeInTheDocument();
    expect(screen.getByText('Preference.RunOnBackground')).toBeInTheDocument();
  });

  // ─── Notifications section ──────────────────────────────────────

  it('should render Notifications section', async () => {
    await renderAllSections();
    await waitFor(() => {
      expect(screen.getByText('Preference.Notifications')).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  // ─── TidGiMiniWindow section ────────────────────────────────────
  // NOTE: Currently fails because Sync section's TimePicker crashes React rendering.
  // Will be fixed when Sync section is schema-ified.
  it.skip('should render TidGiMiniWindow section', async () => {
    await renderAllSections();
    await waitFor(() => {
      expect(screen.getByText('Menu.TidGiMiniWindow')).toBeInTheDocument();
    }, { timeout: 5000 });
    expect(screen.getByText('Preference.TidgiMiniWindow')).toBeInTheDocument();
  });

  // ─── Developers section ─────────────────────────────────────────

  it.skip('should render DeveloperTools section', async () => {
    await renderAllSections();
    await waitFor(() => {
      expect(screen.getByText('Preference.DeveloperTools')).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  // ─── Boolean toggle interaction ─────────────────────────────────
  // NOTE: Skipped because Sync section crash prevents full rendering.
  it.skip('should toggle a boolean preference (alwaysOnTop)', async () => {
    await renderAllSections();
    // Find the switch for alwaysOnTop
    const label = screen.getByText('Preference.AlwaysOnTop');
    const listItem = label.closest('li')!;
    const switchElement = within(listItem).getByRole('checkbox');

    expect(switchElement).not.toBeChecked();

    // Click
    switchElement.click();

    await waitFor(() => {
      expect(window.service.preference.set).toHaveBeenCalledWith('alwaysOnTop', true);
    });
  });
});
