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
import { registerCustomSections } from '../../registerCustomSections';
import { buildVsCodeMcpUrl, DeveloperDiagPanelItem, DeveloperExternalApiItem, DeveloperMcpVsCodeUrlItem } from '../DeveloperToolsItems';

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider theme={lightTheme}>
    {children}
  </ThemeProvider>
);

const createMockPreference = (overrides: Partial<IPreferences> = {}): IPreferences => ({
  ...defaultPreferences,
  ...overrides,
});

describe('DeveloperTools custom items', () => {
  let preferenceSubject: BehaviorSubject<IPreferences | undefined>;
  let writeTextMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    writeTextMock = vi.fn().mockResolvedValue(undefined);

    preferenceSubject = new BehaviorSubject<IPreferences | undefined>(
      createMockPreference({
        externalAPIDebug: true,
      }),
    );

    Object.defineProperty(window.observables.preference, 'preference$', {
      value: preferenceSubject.asObservable(),
      writable: true,
      configurable: true,
    });

    if (!('database' in window.service)) {
      (window.service as Record<string, unknown>).database = {};
    }
    if (!('wiki' in window.service)) {
      (window.service as Record<string, unknown>).wiki = {};
    }
    if (!('view' in window.service)) {
      (window.service as Record<string, unknown>).view = {};
    }

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

    Object.defineProperty(window.service.database, 'getDatabaseInfo', {
      value: vi.fn().mockResolvedValue({ exists: true, size: 1024 }),
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window.service.database, 'getDatabasePath', {
      value: vi.fn().mockResolvedValue('C:\\db\\externalApi.sqlite'),
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window.service.database, 'deleteDatabase', {
      value: vi.fn().mockResolvedValue(undefined),
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window.service.native, 'openPath', {
      value: vi.fn().mockResolvedValue(undefined),
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window.service.native, 'openURI', {
      value: vi.fn().mockResolvedValue(undefined),
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window.service.native, 'log', {
      value: vi.fn().mockResolvedValue(undefined),
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window.service.native, 'getProcessInfo', {
      value: vi.fn().mockResolvedValue({
        mainNode: { pid: 1, title: 'main', rss_MB: 10, heapUsed_MB: 5, heapTotal_MB: 8, external_MB: 1 },
        renderers: [],
      }),
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window.service.wiki, 'getWorkersInfo', {
      value: vi.fn().mockResolvedValue([]),
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window.service.view, 'getViewsInfo', {
      value: vi.fn().mockResolvedValue([]),
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window.service.view, 'openDevToolsForView', {
      value: vi.fn().mockResolvedValue(undefined),
      writable: true,
      configurable: true,
    });

    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });
  });

  it('keeps developers section schema-driven after custom registration', () => {
    registerCustomSections();
    expect(sectionById.get('developers')?.CustomSectionComponent).toBeUndefined();
  });

  it('renders external api controls', async () => {
    render(
      <TestWrapper>
        <DeveloperExternalApiItem onNeedsRestart={() => {}} />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Preference.ExternalAPIDebug')).toBeInTheDocument();
    });

    expect(screen.getByText('Preference.DeleteExternalApiDatabase')).toBeInTheDocument();
    expect(screen.getByText('Preference.OpenDatabaseFolder')).toBeInTheDocument();
  });

  it('opens diag panel dialog', async () => {
    render(
      <TestWrapper>
        <DeveloperDiagPanelItem />
      </TestWrapper>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Preference\.DiagPanel/ }));

    await waitFor(() => {
      expect(screen.getAllByText('Preference.DiagPanel').length).toBeGreaterThan(1);
    });
  });

  it('builds the MCP URL with token query parameter', async () => {
    preferenceSubject.next(createMockPreference({
      mcpServerPort: 38385,
      mcpServerRequireToken: true,
      mcpServerToken: 'abc123token',
    }));

    render(
      <TestWrapper>
        <DeveloperMcpVsCodeUrlItem />
      </TestWrapper>,
    );

    const user = userEvent.setup();
    const button = screen.getByText('Preference.CopyMcpServerUrl').closest('[role="button"]');
    expect(button).not.toBeNull();
    await user.click(button!);

    expect(buildVsCodeMcpUrl(createMockPreference({
      mcpServerPort: 38385,
      mcpServerRequireToken: true,
      mcpServerToken: 'abc123token',
    }))).toBe('http://127.0.0.1:38385/mcp?token=abc123token');

    await waitFor(() => {
      expect(screen.getByText('Preference.CopiedToClipboard')).toBeInTheDocument();
    });
  });

  it('disables copying when token auth is enabled but token is empty', () => {
    preferenceSubject.next(createMockPreference({
      mcpServerRequireToken: true,
      mcpServerToken: '',
    }));

    render(
      <TestWrapper>
        <DeveloperMcpVsCodeUrlItem />
      </TestWrapper>,
    );

    expect(screen.getByRole('button', { name: /Preference\.CopyMcpServerUrl/i })).toHaveAttribute('aria-disabled', 'true');
  });

  it('disables copying when token auth is turned off', () => {
    preferenceSubject.next(createMockPreference({
      mcpServerRequireToken: false,
      mcpServerToken: 'abc123token',
    }));

    render(
      <TestWrapper>
        <DeveloperMcpVsCodeUrlItem />
      </TestWrapper>,
    );

    expect(screen.getByRole('button', { name: /Preference\.CopyMcpServerUrl/i })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Preference.CopyMcpServerUrlRequiresAuthDescription')).toBeInTheDocument();
  });
});
