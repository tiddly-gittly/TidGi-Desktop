import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PromptPreviewController, PromptPreviewDialogState } from 'memeloop';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { PromptPreviewButtonWithMenu } from '../PromptPreviewButtonWithMenu';

vi.mock('@memeloop/react-ui/chat', () => ({
  useAui: () => ({ composer: { getState: () => ({ text: 'unsent input' }) } }),
}));

vi.mock('@/pages/Agent/store/tabStore', () => ({
  useTabStore: () => ({
    addTab: vi.fn(),
    createSplitViewFromTabs: vi.fn(),
    addTabToSplitView: vi.fn(),
    tabs: [],
  }),
}));

vi.mock('../PromptPreviewDialog', () => ({
  PromptPreviewDialog: ({ open, onClose, inputText }: { open: boolean; onClose(): void; inputText: string }) =>
    open
      ? (
        <div>
          <span>{inputText}</span>
          <button type='button' onClick={onClose}>close-preview</button>
        </div>
      )
      : null,
}));

describe('PromptPreviewButtonWithMenu', () => {
  it('yields the click task before opening and closes through the cancelling controller boundary', async () => {
    let state = previewState();
    let listener: ((next: PromptPreviewDialogState) => void) | undefined;
    const controller = {
      getState: () => state,
      subscribe: vi.fn((next: (value: PromptPreviewDialogState) => void) => {
        listener = next;
        return () => {
          listener = undefined;
        };
      }),
      open: vi.fn(() => {
        state = { ...state, open: true };
        listener?.(state);
      }),
      close: vi.fn(() => {
        state = { ...state, open: false };
        listener?.(state);
      }),
    } as unknown as PromptPreviewController;

    render(
      <PromptPreviewButtonWithMenu
        tabId='tab-1'
        agentId='conversation-1'
        agentDefinitionId='definition-1'
        controller={controller}
      />,
    );
    fireEvent.click(screen.getByTestId('prompt-preview-button'));
    expect(controller.open).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(controller.open).toHaveBeenCalledOnce();
    });
    expect(screen.getByText('unsent input')).toBeInTheDocument();
    fireEvent.click(screen.getByText('close-preview'));
    expect(controller.close).toHaveBeenCalledOnce();
  });

  it('cancels a deferred preview open when the toolbar unmounts', async () => {
    const controller = {
      getState: () => previewState(),
      subscribe: vi.fn(() => () => undefined),
      open: vi.fn(),
      close: vi.fn(),
    } as unknown as PromptPreviewController;
    const rendered = render(
      <PromptPreviewButtonWithMenu
        tabId='tab-1'
        agentId='conversation-1'
        agentDefinitionId='definition-1'
        controller={controller}
      />,
    );

    fireEvent.click(screen.getByTestId('prompt-preview-button'));
    rendered.unmount();
    await new Promise(resolve => setTimeout(resolve, 5));

    expect(controller.open).not.toHaveBeenCalled();
    expect(controller.close).toHaveBeenCalledOnce();
  });
});

function previewState(): PromptPreviewDialogState {
  return {
    open: false,
    baseMode: 'preview',
    activeTab: 'tree',
    loading: false,
    progress: 0,
    currentStep: 'idle',
    currentStepDisplay: null,
    currentPlugin: null,
    result: null,
    lastUpdated: null,
    formFieldsToScrollTo: [],
  };
}
