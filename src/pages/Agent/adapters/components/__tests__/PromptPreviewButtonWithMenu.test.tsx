import { fireEvent, render, screen } from '@testing-library/react';
import type { PromptPreviewController, PromptPreviewDialogState } from 'memeloop';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { PromptPreviewButtonWithMenu } from '../PromptPreviewButtonWithMenu';

vi.mock('@memeloop/react-ui/chat', () => ({
  useAui: () => ({ composer: () => ({ getState: () => ({ text: 'unsent input' }) }) }),
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
  it('opens from the chat toolbar and closes through the cancelling controller boundary', () => {
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
    expect(controller.open).toHaveBeenCalledOnce();
    expect(screen.getByText('unsent input')).toBeInTheDocument();
    fireEvent.click(screen.getByText('close-preview'));
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
