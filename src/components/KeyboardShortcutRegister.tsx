import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface KeyboardShortcutRegisterProps {
  /** Current shortcut key value */
  value: string;
  /** Callback function when shortcut key changes */
  onChange: (value: string) => void;
  /** Feature name, displayed on the button */
  label: string;
  /** Button variant */
  variant?: 'text' | 'outlined' | 'contained';
  /** Button color */
  color?: 'inherit' | 'primary' | 'secondary' | 'success' | 'error' | 'info' | 'warning';
  /** Disabled state */
  disabled?: boolean;
}

/**
 * Keyboard shortcut register component
 * Provides a button that opens a modal dialog when clicked, allowing users to set shortcuts via keystrokes
 */
export const KeyboardShortcutRegister: React.FC<KeyboardShortcutRegisterProps> = ({
  value,
  onChange,
  label,
  variant = 'outlined',
  color = 'primary',
  disabled = false,
}) => {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentKeyCombo, setCurrentKeyCombo] = useState(value);

  /**
   * Format shortcut text for display
   */
  const formatShortcutText = useCallback((shortcut: string): string => {
    if (!shortcut) return t('KeyboardShortcut.None');
    return shortcut;
  }, [t]);

  /**
   * Handle keyboard events to update current shortcut combination
   */
  const handleKeyDown = useCallback(async (event: KeyboardEvent) => {
    // Handle special keys for dialog control
    if (event.key === 'Escape') {
      event.preventDefault();
      setDialogOpen(false);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      onChange(currentKeyCombo);
      setDialogOpen(false);
      return;
    }

    // Prevent default behavior to avoid page scrolling
    event.preventDefault();

    // Get the currently pressed key
    const key = event.key;

    // Ignore modifier keys pressed alone
    if (['Shift', 'Control', 'Alt', 'Meta', 'OS'].includes(key)) {
      return;
    }

    // Build the shortcut combination
    const combo: string[] = [];

    try {
      if (event.ctrlKey || event.metaKey) {
        const platform = await window.service.context.get('platform');
        const modifier = platform === 'darwin' ? 'Cmd' : 'Ctrl';
        combo.push(modifier);
      }

      if (event.altKey) {
        combo.push('Alt');
      }

      if (event.shiftKey) {
        combo.push('Shift');
      }

      // Add the main key
      combo.push(key);

      // Update current shortcut combination
      const newCombo = combo.join('+');
      setCurrentKeyCombo(newCombo);
    } catch {
      // Handle error silently
    }
  }, [onChange, currentKeyCombo]);

  /**
   * Open the dialog
   */
  const handleOpenDialog = useCallback(() => {
    setCurrentKeyCombo(value);
    setDialogOpen(true);
  }, [value]);

  /**
   * Close the dialog
   */
  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
  }, []);

  /**
   * Confirm shortcut key setting
   */
  const handleConfirm = useCallback(() => {
    onChange(currentKeyCombo);
    setDialogOpen(false);
  }, [onChange, currentKeyCombo]);

  /**
   * Clear shortcut key
   */
  const handleClear = useCallback(() => {
    setCurrentKeyCombo('');
  }, []);

  /**
   * Add or remove keyboard event listeners when dialog opens or closes
   */
  useEffect(() => {
    const keyDownHandler = (event: KeyboardEvent) => {
      void handleKeyDown(event);
    };

    if (dialogOpen) {
      document.addEventListener('keydown', keyDownHandler);
    } else {
      document.removeEventListener('keydown', keyDownHandler);
    }

    return () => {
      document.removeEventListener('keydown', keyDownHandler);
    };
  }, [dialogOpen, handleKeyDown]);

  return (
    <>
      <Button
        variant={variant}
        color={color}
        onClick={handleOpenDialog}
        disabled={disabled}
        fullWidth
        data-testid='shortcut-register-button'
      >
        {label}: {formatShortcutText(value)}
      </Button>

      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        maxWidth='sm'
        fullWidth
        data-testid='shortcut-dialog'
      >
        <DialogTitle>{t('KeyboardShortcut.RegisterShortcut')}</DialogTitle>
        <DialogContent data-testid='shortcut-dialog-content'>
          <Typography variant='body1' gutterBottom>
            {t('KeyboardShortcut.PressKeysPrompt', { feature: label })}
          </Typography>

          <Box
            data-testid='shortcut-display'
            sx={{
              padding: 2,
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              marginBottom: 2,
              textAlign: 'center',
              backgroundColor: 'background.paper',
            }}
          >
            <Typography variant='h5' component='div'>
              {currentKeyCombo || t('KeyboardShortcut.PressKeys')}
            </Typography>
          </Box>

          <Typography variant='caption' color='textSecondary'>
            {t('KeyboardShortcut.HelpText')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClear} color='inherit' data-testid='shortcut-clear-button'>
            {t('KeyboardShortcut.Clear')}
          </Button>
          <Button onClick={handleCloseDialog} data-testid='shortcut-cancel-button'>
            {t('Cancel')}
          </Button>
          <Button onClick={handleConfirm} variant='contained' color={color} data-testid='shortcut-confirm-button'>
            {t('Confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
