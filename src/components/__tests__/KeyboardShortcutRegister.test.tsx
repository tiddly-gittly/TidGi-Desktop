import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '@services/theme/defaultTheme';

import { KeyboardShortcutRegister } from '../KeyboardShortcutRegister';

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider theme={lightTheme}>
    {children}
  </ThemeProvider>
);

describe('KeyboardShortcutRegister Component', () => {
  let mockOnChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnChange = vi.fn();
  });

  const renderComponent = (overrides: {
    value?: string;
    onChange?: (value: string) => void;
    label?: string;
    disabled?: boolean;
  } = {}) => {
    const defaultProps = {
      value: '',
      onChange: mockOnChange,
      label: 'Test Shortcut',
      disabled: false,
      ...overrides,
    };

    return render(
      <TestWrapper>
        <KeyboardShortcutRegister {...defaultProps} />
      </TestWrapper>,
    );
  };

  describe('Initial state and rendering', () => {
    it('should display button with label and current shortcut value', () => {
      renderComponent({
        value: 'Ctrl+Shift+T',
        label: 'Toggle Window',
      });

      const button = screen.getByTestId('shortcut-register-button');
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent('Toggle Window');
      expect(button).toHaveTextContent('Ctrl+Shift+T');
    });

    it('should display "None" when no shortcut is set', () => {
      renderComponent({
        value: '',
        label: 'Toggle Window',
      });

      const button = screen.getByTestId('shortcut-register-button');
      expect(button).toHaveTextContent('KeyboardShortcut.None');
    });

    it('should respect disabled state', () => {
      renderComponent({
        disabled: true,
      });

      const button = screen.getByTestId('shortcut-register-button');
      expect(button).toBeDisabled();
    });

    it('should not show dialog initially', () => {
      renderComponent();

      expect(screen.queryByTestId('shortcut-dialog')).not.toBeInTheDocument();
    });
  });

  describe('Dialog interaction', () => {
    it('should open dialog when button is clicked', async () => {
      const user = userEvent.setup();
      renderComponent();

      const button = screen.getByTestId('shortcut-register-button');
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByTestId('shortcut-dialog')).toBeInTheDocument();
      });

      expect(screen.getByText('KeyboardShortcut.RegisterShortcut')).toBeInTheDocument();
    });

    it('should display current shortcut in dialog initially', async () => {
      const user = userEvent.setup();
      renderComponent({
        value: 'Ctrl+A',
      });

      const button = screen.getByTestId('shortcut-register-button');
      await user.click(button);

      await waitFor(() => {
        const display = screen.getByTestId('shortcut-display');
        expect(display).toHaveTextContent('Ctrl+A');
      });
    });

    it('should close dialog when cancel button is clicked', async () => {
      const user = userEvent.setup();
      renderComponent();

      const button = screen.getByTestId('shortcut-register-button');
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByTestId('shortcut-dialog')).toBeInTheDocument();
      });

      // Press ESC to close dialog (MUI Dialog default behavior)
      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByTestId('shortcut-dialog')).not.toBeInTheDocument();
      }, { timeout: 500 });
    });
  });

  describe('Keyboard shortcut capture', () => {
    it('should capture Ctrl key combination', async () => {
      const user = userEvent.setup();
      renderComponent();

      const button = screen.getByTestId('shortcut-register-button');
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByTestId('shortcut-dialog')).toBeInTheDocument();
      });

      const dialogContent = screen.getByTestId('shortcut-dialog-content');

      // Simulate keyboard event with Ctrl+Shift+T
      fireEvent.keyDown(dialogContent, {
        key: 'T',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      });

      await waitFor(() => {
        const display = screen.getByTestId('shortcut-display');
        expect(display).toHaveTextContent('Ctrl+Shift+T');
      });
    });

    it('should capture Cmd key combination on macOS', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
        configurable: true,
      });

      const user = userEvent.setup();
      renderComponent();

      const button = screen.getByTestId('shortcut-register-button');
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByTestId('shortcut-dialog')).toBeInTheDocument();
      });

      const dialogContent = screen.getByTestId('shortcut-dialog-content');

      fireEvent.keyDown(dialogContent, {
        key: 'K',
        metaKey: true,
        bubbles: true,
      });

      await waitFor(() => {
        const display = screen.getByTestId('shortcut-display');
        expect(display).toHaveTextContent('Cmd+K');
      });

      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        writable: true,
        configurable: true,
      });
    });

    it('should capture Alt key combination', async () => {
      const user = userEvent.setup();
      renderComponent();

      const button = screen.getByTestId('shortcut-register-button');
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByTestId('shortcut-dialog')).toBeInTheDocument();
      });

      const dialogContent = screen.getByTestId('shortcut-dialog-content');

      fireEvent.keyDown(dialogContent, {
        key: 'F4',
        altKey: true,
        bubbles: true,
      });

      await waitFor(() => {
        const display = screen.getByTestId('shortcut-display');
        expect(display).toHaveTextContent('Alt+F4');
      });
    });

    it('should ignore modifier keys pressed alone', async () => {
      const user = userEvent.setup();
      renderComponent();

      const button = screen.getByTestId('shortcut-register-button');
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByTestId('shortcut-dialog')).toBeInTheDocument();
      });

      const dialogContent = screen.getByTestId('shortcut-dialog-content');
      const display = screen.getByTestId('shortcut-display');

      // Should show initial "Press keys" message
      expect(display).toHaveTextContent('KeyboardShortcut.PressKeys');

      const modifierKeys = ['Shift', 'Control', 'Alt', 'Meta'];
      for (const key of modifierKeys) {
        fireEvent.keyDown(dialogContent, {
          key,
          bubbles: true,
        });
      }

      // Should still show "Press keys" message
      expect(display).toHaveTextContent('KeyboardShortcut.PressKeys');
    });

    it('should update display when keys are pressed', async () => {
      const user = userEvent.setup();
      renderComponent();

      const button = screen.getByTestId('shortcut-register-button');
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByTestId('shortcut-dialog')).toBeInTheDocument();
      });

      const dialogContent = screen.getByTestId('shortcut-dialog-content');

      // Press first combination
      fireEvent.keyDown(dialogContent, {
        key: 'A',
        ctrlKey: true,
        bubbles: true,
      });

      await waitFor(() => {
        const display = screen.getByTestId('shortcut-display');
        expect(display).toHaveTextContent('Ctrl+A');
      });

      // Press second combination - should replace
      fireEvent.keyDown(dialogContent, {
        key: 'B',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      });

      await waitFor(() => {
        const display = screen.getByTestId('shortcut-display');
        expect(display).toHaveTextContent('Ctrl+Shift+B');
      });
    });
  });

  describe('Clear functionality', () => {
    it('should clear current shortcut when clear button is clicked', async () => {
      const user = userEvent.setup();
      renderComponent({
        value: 'Ctrl+T',
      });

      const button = screen.getByTestId('shortcut-register-button');
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByTestId('shortcut-dialog')).toBeInTheDocument();
      });

      // Initially should show the current value
      const display = screen.getByTestId('shortcut-display');
      expect(display).toHaveTextContent('Ctrl+T');

      // Verify clear button exists and is enabled
      const clearButton = screen.getByTestId('shortcut-clear-button');
      expect(clearButton).toBeInTheDocument();
      expect(clearButton).toBeEnabled();
    });

    it('should call onChange with empty string when cleared and confirmed', async () => {
      const user = userEvent.setup();
      renderComponent({
        value: '', // Start with empty to test setting empty and confirming
      });

      const button = screen.getByTestId('shortcut-register-button');
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByTestId('shortcut-dialog')).toBeInTheDocument();
      });

      // Don't set any keys, just press Enter to confirm empty
      fireEvent.keyDown(document, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(mockOnChange).toHaveBeenCalledWith('');
      });
    });
  });

  describe('Confirm functionality', () => {
    it('should call onChange with new shortcut on confirm', async () => {
      const user = userEvent.setup();
      renderComponent({
        value: '',
      });

      const button = screen.getByTestId('shortcut-register-button');
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByTestId('shortcut-dialog')).toBeInTheDocument();
      });

      const dialogContent = screen.getByTestId('shortcut-dialog-content');

      fireEvent.keyDown(dialogContent, {
        key: 'N',
        ctrlKey: true,
        bubbles: true,
      });

      await waitFor(() => {
        const display = screen.getByTestId('shortcut-display');
        expect(display).toHaveTextContent('Ctrl+N');
      });

      // Press Enter to confirm
      fireEvent.keyDown(document, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(mockOnChange).toHaveBeenCalledWith('Ctrl+N');
      });
    });

    it('should not call onChange when cancel is clicked', async () => {
      const user = userEvent.setup();
      renderComponent({
        value: 'Ctrl+A',
      });

      const button = screen.getByTestId('shortcut-register-button');
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByTestId('shortcut-dialog')).toBeInTheDocument();
      });

      const dialogContent = screen.getByTestId('shortcut-dialog-content');

      fireEvent.keyDown(dialogContent, {
        key: 'B',
        ctrlKey: true,
        bubbles: true,
      });

      await waitFor(() => {
        const display = screen.getByTestId('shortcut-display');
        expect(display).toHaveTextContent('Ctrl+B');
      });

      // Press ESC to cancel without saving
      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

      await waitFor(() => {
        expect(mockOnChange).not.toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.queryByTestId('shortcut-dialog')).not.toBeInTheDocument();
      }, { timeout: 500 });
    });

    it('should close dialog after confirm', async () => {
      const user = userEvent.setup();
      renderComponent();

      const button = screen.getByTestId('shortcut-register-button');
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByTestId('shortcut-dialog')).toBeInTheDocument();
      });

      const dialogContent = screen.getByTestId('shortcut-dialog-content');

      fireEvent.keyDown(dialogContent, {
        key: 'T',
        ctrlKey: true,
        bubbles: true,
      });

      // Press Enter to confirm and close dialog
      fireEvent.keyDown(document, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(screen.queryByTestId('shortcut-dialog')).not.toBeInTheDocument();
      }, { timeout: 500 });
    });
  });

  describe('Help text', () => {
    it('should display help text in dialog', async () => {
      const user = userEvent.setup();
      renderComponent();

      const button = screen.getByTestId('shortcut-register-button');
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByText('KeyboardShortcut.HelpText')).toBeInTheDocument();
      });
    });
  });

  describe('Props validation', () => {
    it('should use custom label', () => {
      renderComponent({ label: 'Custom Label' });

      const button = screen.getByTestId('shortcut-register-button');
      expect(button).toHaveTextContent('Custom Label');
    });

    it('should handle onChange callback', async () => {
      const customOnChange = vi.fn();
      const user = userEvent.setup();

      renderComponent({ onChange: customOnChange });

      const button = screen.getByTestId('shortcut-register-button');
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByTestId('shortcut-dialog')).toBeInTheDocument();
      });

      const dialogContent = screen.getByTestId('shortcut-dialog-content');

      fireEvent.keyDown(dialogContent, {
        key: 'X',
        ctrlKey: true,
        bubbles: true,
      });

      // Press Enter to confirm
      fireEvent.keyDown(document, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(customOnChange).toHaveBeenCalledWith('Ctrl+X');
      });
    });
  });
});
