import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NewModelDialog } from '../NewModelDialog';

describe('NewModelDialog - ComfyUI workflow support', () => {
  const mockOnClose = vi.fn();
  const mockOnAddModel = vi.fn();
  const mockOnSelectDefaultModel = vi.fn();
  const mockOnModelFormChange = vi.fn();
  const mockOnFeatureChange = vi.fn();

  const defaultProps = {
    open: true,
    onClose: mockOnClose,
    onAddModel: mockOnAddModel,
    currentProvider: 'comfyui',
    providerClass: 'comfyui',
    newModelForm: {
      name: 'flux',
      caption: 'Flux',
      features: ['imageGeneration' as const],
      parameters: {},
    },
    availableDefaultModels: [],
    selectedDefaultModel: '',
    onSelectDefaultModel: mockOnSelectDefaultModel,
    onModelFormChange: mockOnModelFormChange,
    onFeatureChange: mockOnFeatureChange,
    editMode: false,
  };

  it('should show workflow file input for ComfyUI provider', async () => {
    render(<NewModelDialog {...defaultProps} />);

    // ComfyUI should show workflow file input
    expect(await screen.findByTestId('workflow-path-input')).toBeInTheDocument();
    expect(await screen.findByTestId('select-workflow-button')).toBeInTheDocument();
  });

  it('should not show workflow file input for non-ComfyUI providers', async () => {
    render(
      <NewModelDialog
        {...defaultProps}
        currentProvider='openai'
        providerClass='openai'
      />,
    );

    // Non-ComfyUI providers should not show workflow input
    expect(screen.queryByTestId('workflow-path-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('select-workflow-button')).not.toBeInTheDocument();
  });

  it('should render workflow input correctly for ComfyUI', async () => {
    render(<NewModelDialog {...defaultProps} />);

    // data-testid is on the input element itself via slotProps.htmlInput
    const workflowInput = await screen.findByTestId('workflow-path-input');
    expect(workflowInput).toBeInTheDocument();
    expect(workflowInput).toHaveAttribute('type', 'text');
  });

  it('should render browse button for ComfyUI', async () => {
    render(<NewModelDialog {...defaultProps} />);

    const browseButton = await screen.findByTestId('select-workflow-button');
    expect(browseButton).toBeInTheDocument();
    expect(browseButton).toHaveTextContent('Preference.Browse');
  });

  it('should display existing workflow path in edit mode', async () => {
    render(
      <NewModelDialog
        {...defaultProps}
        newModelForm={{
          ...defaultProps.newModelForm,
          parameters: {
            workflowPath: 'C:\\existing\\workflow.json',
          },
        }}
        editMode={true}
      />,
    );

    const workflowInput = await screen.findByTestId('workflow-path-input');
    expect(workflowInput).toHaveValue('C:\\existing\\workflow.json');
  });

  it('should show Update button in edit mode', async () => {
    render(<NewModelDialog {...defaultProps} editMode={true} />);

    expect(await screen.findByText('Update')).toBeInTheDocument();
  });

  it('should show Save button in add mode', async () => {
    render(<NewModelDialog {...defaultProps} editMode={false} />);

    expect(await screen.findByText('Save')).toBeInTheDocument();
  });
});
