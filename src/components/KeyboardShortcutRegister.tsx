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
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
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

    if (event.ctrlKey || event.metaKey) {
      combo.push(process.platform === 'darwin' ? 'Cmd' : 'Ctrl');
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
    setCurrentKeyCombo(combo.join('+'));
  }, []);

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
    if (dialogOpen) {
      document.addEventListener('keydown', handleKeyDown);
    } else {
      document.removeEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
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
      >
        {label}: {formatShortcutText(value)}
      </Button>

      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        maxWidth='sm'
        fullWidth
      >
        <DialogTitle>{t('KeyboardShortcut.RegisterShortcut')}</DialogTitle>
        <DialogContent>
          <Typography variant='body1' gutterBottom>
            {t('KeyboardShortcut.PressKeysPrompt', { feature: label })}
          </Typography>

          <Box
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
          <Button onClick={handleClear} color='inherit'>
            {t('KeyboardShortcut.Clear')}
          </Button>
          <Button onClick={handleCloseDialog}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleConfirm} variant='contained' color={color}>
            {t('Confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
