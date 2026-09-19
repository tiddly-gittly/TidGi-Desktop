import type { DialogProps } from '@mui/material';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ModelCatalogModel, ProviderModelRoute } from 'memeloop';
import { describe, expect, it, vi } from 'vitest';

import { NewModelDialog } from '../NewModelDialog';

vi.mock('@mui/material', async importOriginal => {
  const material = await importOriginal<typeof import('@mui/material')>();
  return {
    ...material,
    Dialog: ({ children, open }: Pick<DialogProps, 'children' | 'open'>) => open ? <div role='dialog'>{children}</div> : null,
  };
});

const route: ProviderModelRoute = {
  modelId: 'reasoning',
  wireModelId: 'vendor/gpt-5.6',
  apiMode: 'responses',
};

const model: ModelCatalogModel = {
  id: 'reasoning',
  name: 'Reasoning model',
  attachment: true,
  reasoning: true,
  toolCall: true,
  reasoningEfforts: ['minimal', 'high'],
  structuredOutput: true,
  temperature: true,
  releaseDate: '2026-08-07',
  lastUpdated: '2026-08-26',
  status: 'beta',
  modalities: { input: ['text', 'image'], output: ['text'] },
  limit: { context: 1_000_000, input: 900_000, output: 32_768 },
};

describe('NewModelDialog', () => {
  it('edits one exact logical-to-wire route with catalog metadata', () => {
    const onSave = vi.fn();
    render(
      <NewModelDialog
        open
        route={route}
        model={model}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    expect(screen.getByTestId('new-model-name-input')).toHaveValue('reasoning');
    expect(screen.getByLabelText('Preference.WireModelId')).toHaveValue('vendor/gpt-5.6');
    expect(screen.getByLabelText('Preference.APIMode')).toHaveTextContent('Preference.ResponsesAPIMode');
    expect(screen.getByLabelText('Preference.InputModalities')).toHaveValue('text, image');
    expect(screen.getByLabelText('Preference.OutputModalities')).toHaveValue('text');
    expect(screen.getByTestId('model-context-window-input')).toHaveValue(1_000_000);
    expect(screen.getByTestId('model-max-input-input')).toHaveValue(900_000);
    expect(screen.getByTestId('model-max-output-input')).toHaveValue(32_768);
    expect(screen.getByRole('checkbox', { name: 'Preference.Attachments' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Preference.Reasoning' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Preference.ToolCalling' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Preference.StructuredOutput' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Preference.TemperatureSupport' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Preference.ReasoningEffortMinimal' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Preference.ReasoningEffortLow' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Preference.ReasoningEffortHigh' })).toBeChecked();

    expect(screen.getByTestId('save-new-model-button')).toBeEnabled();
    fireEvent.click(screen.getByTestId('save-new-model-button'));
    expect(onSave).toHaveBeenCalledWith(route, model);
  });

  it('saves newly entered logical and provider wire identifiers without exchanging them', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<NewModelDialog open onClose={vi.fn()} onSave={onSave} />);

    const logicalInput = screen.getByTestId('new-model-name-input');
    await user.click(logicalInput);
    await user.type(logicalInput, '模型2');
    await user.type(screen.getByLabelText('Preference.WireModelId'), '供应商/模型2:latest');
    await user.type(screen.getByLabelText('Preference.ModelCaption'), 'Private model');
    await user.click(screen.getByRole('checkbox', { name: 'Preference.Reasoning' }));
    await user.click(screen.getByRole('checkbox', { name: 'Preference.ToolCalling' }));
    expect(screen.getByTestId('new-model-name-input')).toHaveValue('模型2');
    expect(screen.getByLabelText('Preference.WireModelId')).toHaveValue('供应商/模型2:latest');
    expect(screen.getByLabelText('Preference.ModelCaption')).toHaveValue('Private model');
    expect(screen.getByRole('checkbox', { name: 'Preference.Reasoning' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Preference.ToolCalling' })).toBeChecked();
    fireEvent.click(screen.getByTestId('save-new-model-button'));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ modelId: '模型2', wireModelId: '供应商/模型2:latest' }),
        expect.objectContaining({ id: '模型2' }),
      );
    });
  });

  it('starts a new route with the canonical API mode default', () => {
    render(<NewModelDialog open onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByTestId('new-model-name-input')).toHaveValue('');
    expect(screen.getByLabelText('Preference.WireModelId')).toHaveValue('');
    expect(screen.getByLabelText('Preference.APIMode')).toHaveTextContent('Preference.ChatCompletionsAPIMode');
  });

  it('writes advanced token limits and capability metadata through the canonical catalog shape', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<NewModelDialog open onClose={vi.fn()} onSave={onSave} />);

    await user.type(screen.getByTestId('new-model-name-input'), 'advanced-model');
    await user.type(screen.getByTestId('model-context-window-input'), '128000');
    await user.type(screen.getByTestId('model-max-input-input'), '120000');
    await user.type(screen.getByTestId('model-max-output-input'), '8192');
    await user.click(screen.getByRole('checkbox', { name: 'Preference.Reasoning' }));
    await user.click(screen.getByRole('checkbox', { name: 'Preference.StructuredOutput' }));
    await user.click(screen.getByRole('checkbox', { name: 'Preference.TemperatureSupport' }));
    await user.click(screen.getByRole('checkbox', { name: 'Preference.ReasoningEffortMinimal' }));
    await user.click(screen.getByRole('checkbox', { name: 'Preference.ReasoningEffortHigh' }));
    await user.click(screen.getByTestId('save-new-model-button'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        { modelId: 'advanced-model', wireModelId: 'advanced-model', apiMode: 'chat-completions' },
        expect.objectContaining({
          id: 'advanced-model',
          reasoning: true,
          structuredOutput: true,
          temperature: true,
          reasoningEfforts: ['minimal', 'high'],
          limit: { context: 128_000, input: 120_000, output: 8192 },
        }),
      );
    });
  });

  it('shows a required error instead of silently ignoring an empty logical id', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<NewModelDialog open onClose={vi.fn()} onSave={onSave} />);

    await user.click(screen.getByTestId('save-new-model-button'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Preference.ModelNameRequired')).toBeVisible();
    expect(screen.getByTestId('new-model-name-input')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows a visible error for invalid wire identifiers', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<NewModelDialog open onClose={vi.fn()} onSave={onSave} />);

    await user.type(screen.getByTestId('new-model-name-input'), '模型2');
    await user.type(screen.getByLabelText('Preference.WireModelId'), '供应商/模型 2');
    await user.click(screen.getByTestId('save-new-model-button'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Preference.ModelIdInvalid')).toBeVisible();
    expect(screen.getByLabelText('Preference.WireModelId')).toHaveAttribute('aria-invalid', 'true');
  });
});
