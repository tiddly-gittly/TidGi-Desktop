import { WindowNames } from '@services/windows/WindowProperties';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { PromptPreviewButtonWithMenu } from '../PromptPreviewButtonWithMenu';

vi.mock('@memeloop/react-ui/chat', () => ({
  useAui: () => ({ composer: { getState: () => ({ text: 'unsent input' }) } }),
}));

describe('PromptPreviewButtonWithMenu', () => {
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
});
