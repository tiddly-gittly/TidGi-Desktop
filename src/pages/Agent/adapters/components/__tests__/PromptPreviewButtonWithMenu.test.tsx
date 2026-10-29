import { WindowNames } from '@services/windows/WindowProperties';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { PromptPreviewButtonWithMenu } from '../PromptPreviewButtonWithMenu';

vi.mock('@memeloop/react-ui/chat', () => ({
  useAui: () => ({ composer: { getState: () => ({ text: 'unsent input' }) } }),
}));

describe('PromptPreviewButtonWithMenu', () => {
  beforeAll(() => {
    // The autocomplete setup mocks body listeners; portals need real event delegation.
    document.body.addEventListener = EventTarget.prototype.addEventListener;
    document.body.removeEventListener = EventTarget.prototype.removeEventListener;
  });
  it('yields the click task before opening a separate prompt workspace window', async () => {
    const open = vi.mocked(window.service.window.open);
    open.mockReset();
    render(
      <PromptPreviewButtonWithMenu
        agentId='conversation-1'
        agentDefinitionId='definition-1'
      />,
    );
    fireEvent.click(screen.getByTestId('prompt-preview-button'));
    expect(open).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(open).toHaveBeenCalledWith(
        WindowNames.promptPreview,
        {
          agentId: 'conversation-1',
          agentDefinitionId: 'definition-1',
          inputText: 'unsent input',
          initialBaseMode: 'preview',
        },
      );
    });
  });

  it('cancels a deferred preview-window open when the toolbar unmounts', async () => {
    const open = vi.mocked(window.service.window.open);
    open.mockReset();
    const rendered = render(
      <PromptPreviewButtonWithMenu
        agentId='conversation-1'
        agentDefinitionId='definition-1'
      />,
    );

    fireEvent.click(screen.getByTestId('prompt-preview-button'));
    rendered.unmount();
    await new Promise(resolve => setTimeout(resolve, 5));

    expect(open).not.toHaveBeenCalled();
  });

  it('opens the edit menu on long press without also opening preview on release', async () => {
    const open = vi.mocked(window.service.window.open);
    open.mockReset();
    render(<PromptPreviewButtonWithMenu agentId='conversation-1' agentDefinitionId='definition-1' />);
    const button = screen.getByTestId('prompt-preview-button');
    fireEvent.touchStart(button);
    expect(await screen.findByRole('menuitem')).toBeVisible();
    fireEvent.touchEnd(button);
    fireEvent.click(button);
    expect(open).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('menuitem'));
    await waitFor(() => {
      expect(open).toHaveBeenCalledWith(WindowNames.promptPreview, expect.objectContaining({ initialBaseMode: 'edit' }));
    });
  });
});
