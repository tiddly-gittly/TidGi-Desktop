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
  modalities: { input: ['text', 'image'], output: ['text'] },
};

describe('NewModelDialog', () => {
  it('edits one exact logical-to-wire route with catalog metadata', () => {
    render(
      <NewModelDialog
        open
        route={route}
        model={model}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByTestId('new-model-name-input')).toHaveValue('reasoning');
    expect(screen.getByLabelText('Preference.WireModelId')).toHaveValue('vendor/gpt-5.6');
    expect(screen.getByLabelText('Preference.APIMode')).toHaveTextContent('Preference.ResponsesAPIMode');
    expect(screen.getByLabelText('Preference.InputModalities')).toHaveValue('text, image');
    expect(screen.getByLabelText('Preference.OutputModalities')).toHaveValue('text');
    expect(screen.getByRole('checkbox', { name: 'Preference.Attachments' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Preference.Reasoning' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Preference.ToolCalling' })).toBeChecked();

    expect(screen.getByTestId('save-new-model-button')).toBeEnabled();
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
});
