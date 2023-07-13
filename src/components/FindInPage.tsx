import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

const Root = styled.div`
  display: flex;
  align-items: center;
  padding: 0 4px;
  z-index: 1;
  height: 41px;
  border-bottom: 1px solid ${({ theme }) => theme.palette.divider};
  width: 100%;
`;
const InfoContainer = styled.div`
  flex: 1;
  padding: 0 12px;
`;

export default function FindInPage(): JSX.Element | null {
  const { t } = useTranslation();
  const [open, openSetter] = useState(false);
  const [text, textSetter] = useState('');
  const [activeMatch, activeMatchSetter] = useState(0);
  const [matches, matchesSetter] = useState(0);

  const inputReference = useRef<HTMLInputElement>(null);
  // https://stackoverflow.com/a/57556594
  // Event handler utilizing useCallback ...
  // ... so that reference never changes.
  const handleOpenFindInPage = useCallback(() => {
    openSetter(true);
    inputReference.current?.focus();
    inputReference.current?.select();
  }, [inputReference, openSetter]);
  const handleCloseFindInPage = useCallback(() => {
    openSetter(false);
    textSetter('');
    activeMatchSetter(0);
    matchesSetter(0);
  }, []);
  const updateFindInPageMatches = useCallback(
    (_event: Electron.IpcRendererEvent, activeMatchOrdinal: number, matchesResult: number) => {
      activeMatchSetter(activeMatchOrdinal);
      matchesSetter(matchesResult);
    },
    [activeMatchSetter, matchesSetter],
  );
  useEffect(() => {
    window.remote.registerOpenFindInPage(handleOpenFindInPage);
    window.remote.registerCloseFindInPage(handleCloseFindInPage);
    window.remote.registerUpdateFindInPageMatches(updateFindInPageMatches);
    // Remove event listener on cleanup
    return () => {
      window.remote.unregisterOpenFindInPage(handleOpenFindInPage);
      window.remote.unregisterCloseFindInPage(handleCloseFindInPage);
      window.remote.unregisterUpdateFindInPageMatches(updateFindInPageMatches);
    };
  }, [handleCloseFindInPage, handleOpenFindInPage, updateFindInPageMatches]);
  if (!open) {
    // eslint-disable-next-line unicorn/no-null
    return null;
  }
  return (
    <Root>
      <InfoContainer>
        <Typography variant='body2'>
          <strong>{activeMatch}</strong>
          <span>/</span>
          <strong>{matches}</strong>
          <span>{t('Menu.FindMatches')}</span>
        </Typography>
      </InfoContainer>
      <div>
        <TextField
          autoFocus
          inputRef={inputReference}
          placeholder={t('Menu.Find')}
          value={text}
          margin='dense'
          onChange={(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            const value = event.target.value;
            if (typeof value !== 'string') return;
            textSetter(value);
            if (value.length > 0) {
              void window.service.window.findInPage(value, true);
            } else {
              void window.service.window.stopFindInPage();
            }
          }}
          onInput={(event: React.FormEvent<HTMLInputElement>) => {
            const value = event.currentTarget.value;
            if (typeof value !== 'string') return;
            textSetter(value);
            if (value.length > 0) {
              void window.service.window.findInPage(value, true);
            } else {
              void window.service.window.stopFindInPage();
            }
          }}
          onKeyDown={(event: React.KeyboardEvent<HTMLSpanElement>) => {
            if (
              event.key === 'Enter' && // Enter
              text.length > 0
            ) {
              void window.service.window.findInPage(text, true);
            }
            if (event.key === 'Escape') {
              // Escape
              void window.service.window.stopFindInPage(true);
              openSetter(false);
            }
            if (event.key === 'Backspace' && (event.ctrlKey || event.metaKey)) {
              textSetter('');
            }
          }}
        />
      </div>
      <Button
        size='small'
        disabled={text.length === 0 || matches < 1}
        onClick={() => {
          if (text.length > 0) {
            void window.service.window.findInPage(text, false);
          }
        }}
      >
        {t('Menu.FindPrevious')}
      </Button>
      <Button
        size='small'
        disabled={text.length === 0 || matches < 1}
        onClick={() => {
          if (text.length > 0) {
            void window.service.window.findInPage(text, true);
          }
        }}
      >
        {t('Menu.FindNext')}
      </Button>
      <Button
        size='small'
        disabled={text.length === 0}
        onClick={() => {
          if (text.length > 0) {
            void window.service.window.findInPage(text, true);
          }
        }}
      >
        {t('Menu.Find')}
      </Button>
      <Button
        size='small'
        onClick={() => {
          void window.service.window.stopFindInPage(true);
          openSetter(false);
        }}
      >
        {t('Menu.Close')}
      </Button>
    </Root>
  );
}
