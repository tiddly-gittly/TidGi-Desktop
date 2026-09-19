import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '@services/theme/defaultTheme';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIAgent, clearAgentDatabase } from '../AIAgent';

describe('AIAgent database recovery', () => {
  const deleteDatabase = vi.fn();

  beforeEach(() => {
    deleteDatabase.mockReset();
    deleteDatabase.mockResolvedValue(undefined);
    if (!('database' in window.service)) {
      (window.service as Record<string, unknown>).database = {};
    }
    Object.defineProperty(window.service.database, 'getDatabaseInfo', {
      value: vi.fn().mockResolvedValue({ exists: true, size: 86_016 }),
      configurable: true,
    });
    Object.defineProperty(window.service.database, 'getDatabasePath', {
      value: vi.fn().mockResolvedValue('C:\\userData\\cache-database\\meme-loop-cache.db'),
      configurable: true,
    });
    Object.defineProperty(window.service.database, 'deleteDatabase', {
      value: deleteDatabase,
      configurable: true,
      writable: true,
    });
    if (!('agentInstance' in window.service)) {
      (window.service as Record<string, unknown>).agentInstance = {};
    }
    Object.defineProperty(window.service.agentInstance, 'listScheduledTasks', {
      value: vi.fn().mockResolvedValue([]),
      configurable: true,
    });
    if (!('agentDefinition' in window.service)) {
      (window.service as Record<string, unknown>).agentDefinition = {};
    }
    Object.defineProperty(window.service.agentDefinition, 'getAgentDefs', {
      value: vi.fn().mockResolvedValue([]),
      configurable: true,
    });
  });

  it('keeps the shared scheduled-task editor reachable through stable controls', async () => {
    render(
      <ThemeProvider theme={lightTheme}>
        <AIAgent sectionRef={React.createRef()} onNeedsRestart={vi.fn()} />
      </ThemeProvider>,
    );

    fireEvent.click(await screen.findByTestId('scheduled-task-add-button'));

    expect(await screen.findByTestId('scheduled-task-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('scheduled-task-cancel-button')).toBeInTheDocument();
  });

  it('keeps the Agent cache cleanup control available while Agent services are unavailable', async () => {
    const onNeedsRestart = vi.fn();
    render(
      <ThemeProvider theme={lightTheme}>
        <AIAgent sectionRef={React.createRef()} onNeedsRestart={onNeedsRestart} />
      </ThemeProvider>,
    );

    expect(await screen.findByText('Preference.DeleteAgentDatabase')).toBeInTheDocument();
  });

  it('requests a restart after deleting the Agent cache', async () => {
    const onNeedsRestart = vi.fn();

    await clearAgentDatabase({ deleteDatabase }, onNeedsRestart);

    expect(deleteDatabase).toHaveBeenCalledOnce();
    expect(deleteDatabase).toHaveBeenCalledWith('meme-loop');
    expect(onNeedsRestart).toHaveBeenCalledOnce();
  });
});
