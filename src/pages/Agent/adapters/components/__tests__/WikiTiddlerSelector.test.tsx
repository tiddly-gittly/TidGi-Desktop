import '@testing-library/jest-dom/vitest';

import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '@services/theme/defaultTheme';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WikiTiddlerSelector } from '../WikiTiddlerSelector';

const getWorkspacesAsList = vi.mocked(window.service.workspace.getWorkspacesAsList);

function renderSelector() {
  render(
    <ThemeProvider theme={lightTheme}>
      <WikiTiddlerSelector onAddImage={vi.fn()} onSelect={vi.fn()} />
      <button type='button' data-testid='outside-picker'>Outside picker</button>
    </ThemeProvider>,
  );
}

describe('WikiTiddlerSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWorkspacesAsList.mockResolvedValue([]);
  });

  it('keeps the attachment picker open after its input receives focus', async () => {
    const user = userEvent.setup();
    renderSelector();

    const button = screen.getByTestId('agent-attach-button');
    await user.click(button);

    const input = await screen.findByTestId('attachment-autocomplete-input');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await user.click(input);
    expect(input).toHaveFocus();
    expect(screen.getByTestId('attachment-listbox')).toBeVisible();
  });

  it('closes the attachment picker on an outside click', async () => {
    const user = userEvent.setup();
    renderSelector();

    const button = screen.getByTestId('agent-attach-button');
    await user.click(button);
    expect(await screen.findByTestId('attachment-autocomplete-input')).toBeVisible();

    await user.click(screen.getByTestId('outside-picker'));

    await waitFor(() => {
      expect(button).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByTestId('attachment-autocomplete-input')).not.toBeInTheDocument();
    });
  });
});
