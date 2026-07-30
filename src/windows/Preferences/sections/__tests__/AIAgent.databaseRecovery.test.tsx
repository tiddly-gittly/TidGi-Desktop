import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '@services/theme/defaultTheme';
import { render, screen } from '@testing-library/react';
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

    expect(deleteDatabase).toHaveBeenNthCalledWith(1, 'meme-loop');
    expect(deleteDatabase).toHaveBeenNthCalledWith(2, 'agent');
    expect(onNeedsRestart).toHaveBeenCalledOnce();
  });
});
