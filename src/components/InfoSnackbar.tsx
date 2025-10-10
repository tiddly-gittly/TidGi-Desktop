import { Alert, Snackbar } from '@mui/material';
import React, { useCallback, useState } from 'react';

export interface ShowInfoSnackbarOptions {
  message: string;
  severity?: 'success' | 'info' | 'warning' | 'error';
}

export function useInfoSnackbar(): [
  (options: ShowInfoSnackbarOptions) => void,
  React.JSX.Element,
] {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState<'success' | 'info' | 'warning' | 'error'>('info');

  const showInfoSnackbar = useCallback((options: ShowInfoSnackbarOptions) => {
    setMessage(options.message);
    setSeverity(options.severity || 'info');
    setOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const InfoSnackbarComponent = (
    <Snackbar
      open={open}
      autoHideDuration={6000}
      onClose={handleClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert onClose={handleClose} severity={severity} variant='filled'>
        {message}
      </Alert>
    </Snackbar>
  );

  return [showInfoSnackbar, InfoSnackbarComponent];
}
