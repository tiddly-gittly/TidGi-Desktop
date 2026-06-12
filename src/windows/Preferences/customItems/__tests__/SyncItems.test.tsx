import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ThemeProvider } from '@mui/material/styles';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { BehaviorSubject } from 'rxjs';

import { defaultPreferences } from '@services/preferences/defaultPreferences';
import { sectionById } from '@services/preferences/definitions/registry';
import type { IPreferences } from '@services/preferences/interface';
import { lightTheme } from '@services/theme/defaultTheme';
import { registerCustomSections } from '../../registerCustomSections';
import { SyncAiTimeoutItem, SyncMoreSettingsItem } from '../SyncItems';

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

describe('Sync custom items', () => {
  let preferenceSubject: BehaviorSubject<IPreferences | undefined>;

  beforeEach(() => {
    vi.clearAllMocks();

    preferenceSubject = new BehaviorSubject<IPreferences | undefined>(
      createMockPreference({
        aiGenerateBackupTitle: true,
        aiGenerateBackupTitleTimeout: 5000,
      }),
    );

    Object.defineProperty(window.observables.preference, 'preference$', {
      value: preferenceSubject.asObservable(),
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window.service.preference, 'set', {
      value: vi.fn(async (key: string, value: unknown) => {
        const current = preferenceSubject.value;
        if (current) {
          preferenceSubject.next({ ...current, [key]: value });
        }
      }),
      writable: true,
      configurable: true,
    });
  });

  it('keeps sync section schema-driven after custom registration', () => {
    registerCustomSections();
    expect(sectionById.get('sync')?.CustomSectionComponent).toBeUndefined();
  });

  it('renders ai timeout item and updates timeout', async () => {
    render(
      <TestWrapper>
        <SyncAiTimeoutItem />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Preference.AIGenerateBackupTitleTimeout')).toBeInTheDocument();
    });

    const input = screen.getByDisplayValue('5');
    fireEvent.change(input, { target: { value: '12' } });

    expect(window.service.preference.set).toHaveBeenCalledWith('aiGenerateBackupTitleTimeout', 12000);
  });

  it('renders more settings item', () => {
    render(
      <TestWrapper>
        <SyncMoreSettingsItem />
      </TestWrapper>,
    );

    expect(screen.getByText('Preference.MoreWorkspaceSyncSettings (Mac/Linux)')).toBeInTheDocument();
  });
});
