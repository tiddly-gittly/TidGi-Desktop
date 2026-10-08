import { act, fireEvent, render, screen } from '@testing-library/react';
import type { PromptPreviewController, PromptPreviewDialogState } from 'memeloop';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EditView } from '../EditView';

vi.mock('@memeloop/react-ui/agent/prompts', () => ({
  PromptConfigForm: (
    { formFieldsToScrollTo, onChange, onFieldReveal }: {
      formFieldsToScrollTo?: string[];
      onChange?(value: unknown): void;
      onFieldReveal?(path: string[]): void;
    },
  ) => (
    <div data-testid='prompt-config-form'>
      <button
        type='button'
        data-testid='reveal-selection'
        onClick={() => onFieldReveal?.(formFieldsToScrollTo ?? [])}
      >
        reveal
      </button>
      <button
        type='button'
        data-testid='edit-prompt'
        onClick={() => onChange?.({ prompts: [{ id: 'system', text: 'latest template' }], plugins: [] })}
      >
        edit
      </button>
    </div>
  ),
}));

describe('EditView tree selection', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('binds the selected tree path to the shared form reveal primitive', () => {
    const controller = {
      setFormFieldsToScrollTo: vi.fn(),
      generate: vi.fn(),
    } as unknown as PromptPreviewController;

    render(
      <EditView
        isFullScreen={false}
        inputText=''
        agentId='conversation-1'
        state={previewState({ formFieldsToScrollTo: ['plugins', 'search-plugin'] })}
        controller={controller}
        agentFrameworkConfigLoading={false}
        agentFrameworkConfig={{ prompts: [], plugins: [{ id: 'search-plugin', toolId: 'search' }] }}
        setAgentFrameworkConfig={vi.fn()}
        handlerSchema={{ type: 'object' }}
        persistAgentFrameworkConfig={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('reveal-selection'));
    expect(controller.setFormFieldsToScrollTo).toHaveBeenCalledWith([]);
  });

  it('persists an edit before regenerating the live preview used by the next turn', async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    const persist = vi.fn(async () => {
      order.push('persist');
    });
    const controller = {
      setFormFieldsToScrollTo: vi.fn(),
      generate: vi.fn(async () => {
        order.push('preview');
        return null;
      }),
    } as unknown as PromptPreviewController;

    render(
      <EditView
        isFullScreen={false}
        inputText='current turn'
        agentId='conversation-1'
        state={previewState()}
        controller={controller}
        agentFrameworkConfigLoading={false}
        agentFrameworkConfig={{ prompts: [], plugins: [] }}
        setAgentFrameworkConfig={vi.fn()}
        handlerSchema={{ type: 'object' }}
        persistAgentFrameworkConfig={persist}
      />,
    );

    fireEvent.click(screen.getByTestId('edit-prompt'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(order).toEqual(['persist', 'preview']);
    expect(controller.generate).toHaveBeenCalledWith(
      { prompts: [{ id: 'system', text: 'latest template' }], plugins: [] },
      'conversation-1',
      'current turn',
    );
  });

  it('cancels a pending autosave when the independent window closes', async () => {
    vi.useFakeTimers();
    const persist = vi.fn();
    const rendered = render(
      <EditView
        isFullScreen={false}
        inputText=''
        agentId='conversation-1'
        state={previewState()}
        controller={{ generate: vi.fn(), setFormFieldsToScrollTo: vi.fn() } as unknown as PromptPreviewController}
        agentFrameworkConfigLoading={false}
        agentFrameworkConfig={{ prompts: [], plugins: [] }}
        setAgentFrameworkConfig={vi.fn()}
        handlerSchema={{ type: 'object' }}
        persistAgentFrameworkConfig={persist}
      />,
    );

    fireEvent.click(screen.getByTestId('edit-prompt'));
    rendered.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(persist).not.toHaveBeenCalled();
  });
});

function previewState(overrides: Partial<PromptPreviewDialogState> = {}): PromptPreviewDialogState {
  return {
    open: true,
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
    ...overrides,
  };
}
