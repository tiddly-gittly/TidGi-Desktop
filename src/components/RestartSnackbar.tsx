import React, { useCallback, useState } from 'react';
import { Snackbar, Button, IconButton, Tooltip } from '@material-ui/core';
import { Close as CloseIcon } from '@material-ui/icons';
import { useTranslation } from 'react-i18next';
import { useDebouncedFn } from 'beautiful-react-hooks';

export function useRestartSnackbar(waitBeforeCountDown = 500, waitBeforeRestart = 5000): [() => void, JSX.Element] {
  const { t } = useTranslation();
  const [opened, openedSetter] = useState(false);

  const handleCloseAndRestart = useCallback(() => {
    openedSetter(false);
    // void window.service.window.requestRestart();
  }, [openedSetter]);

  const handleCancelRestart = useCallback(() => {
    openedSetter(false);
  }, [openedSetter]);

  const requestRestartCountDown = useDebouncedFn(
    () => {
      openedSetter(true);
    },
    waitBeforeCountDown,
    { leading: false },
    [openedSetter],
  );

  return [
    requestRestartCountDown,
    <div key="RestartSnackbar">
      <Snackbar
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        open={opened}
        onClose={handleCloseAndRestart}
        message={t('Dialog.RestartMessage')}
        autoHideDuration={waitBeforeRestart}
        action={
          <>
            <Button color="secondary" size="small" onClick={handleCloseAndRestart}>
              {t('Dialog.RestartNow')}
            </Button>
            <Tooltip title={<span>{t('Dialog.Later')}</span>}>
              <IconButton size="small" aria-label="close" color="inherit" onClick={handleCancelRestart}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        }
      />
    </div>,
  ];
}
