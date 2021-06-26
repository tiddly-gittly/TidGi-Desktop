import React, { useCallback, useState, useRef } from 'react';
import { delay } from 'bluebird';
import { Snackbar, Button, IconButton, Tooltip } from '@material-ui/core';
import { Close as CloseIcon } from '@material-ui/icons';
import { useTranslation } from 'react-i18next';
import { useDebouncedFn } from 'beautiful-react-hooks';

export function useRestartSnackbar(waitBeforeCountDown = 1000, waitBeforeRestart = 5000): [() => void, JSX.Element] {
  const { t } = useTranslation();
  const [opened, openedSetter] = useState(false);
  const [inCountDown, inCountDownSetter] = useState(false);
  const [currentWaitBeforeRestart, currentWaitBeforeRestartSetter] = useState(waitBeforeRestart);

  const handleCloseAndRestart = useCallback(() => {
    openedSetter(false);
    inCountDownSetter(false);
    void window.service.window.requestRestart();
  }, [openedSetter]);

  const handleCancelRestart = useCallback(() => {
    openedSetter(false);
    inCountDownSetter(false);
  }, [openedSetter]);

  const startRestartCountDown = useDebouncedFn(
    () => {
      inCountDownSetter(true);
      openedSetter(true);
    },
    waitBeforeCountDown,
    { leading: false },
    [openedSetter, inCountDown, inCountDownSetter],
  );

  const requestRestartCountDown = useCallback(() => {
    if (inCountDown) {
      // if already started,refresh count down of autoHideDuration, so the count down will rerun
      // so if user is editing userName in the config, count down will refresh on each onChange of Input
      currentWaitBeforeRestartSetter(currentWaitBeforeRestart + 1);
    } else {
      // of not started, we try start it
      startRestartCountDown();
    }
  }, [inCountDown, currentWaitBeforeRestart, startRestartCountDown]);

  return [
    requestRestartCountDown,
    <div key="RestartSnackbar">
      <Snackbar
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        open={opened}
        onClose={handleCloseAndRestart}
        message={t('Dialog.RestartMessage')}
        autoHideDuration={currentWaitBeforeRestart}
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
