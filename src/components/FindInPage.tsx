import React, { useState, useCallback, useEffect, useRef } from 'react';
import styled from 'styled-components';
import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';

const Root = styled.div`
  display: flex;
  align-items: center;
  padding: 0 4px;
  z-index: 1;
  height: 41px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.2);
  width: 100%;
`;
const InfoContainer = styled.div`
  flex: 1;
  padding: 0 12px;
`;

export default function FindInPage(): JSX.Element | null {
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
  const updateFindInPageMatches = useCallback(
    (_event: Electron.IpcRendererEvent, activeMatchOrdinal: number, matchesResult: number) => {
      activeMatchSetter(activeMatchOrdinal);
      matchesSetter(matchesResult);
    },
    [activeMatchSetter, matchesSetter],
  );
  useEffect(() => {
    window.remote.registerOpenFindInPage(handleOpenFindInPage);
    window.remote.registerUpdateFindInPageMatches(updateFindInPageMatches);
    // Remove event listener on cleanup
    return () => {
      window.remote.unregisterOpenFindInPage(handleOpenFindInPage);
      window.remote.unregisterUpdateFindInPageMatches(updateFindInPageMatches);
    };
  }, [handleOpenFindInPage, updateFindInPageMatches]);
  if (!open) {
    // eslint-disable-next-line unicorn/no-null
    return null;
  }
  return (
    <Root>
      <InfoContainer>
        <Typography variant="body2">
          <strong>{activeMatch}</strong>
          <span> / </span>
          <strong>{matches}</strong>
          <span> matches</span>
        </Typography>
      </InfoContainer>
      <div>
        <TextField
          autoFocus
          inputRef={inputReference}
          placeholder="Find"
          value={text}
          margin="dense"
          onChange={(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            const value = event.target.value;
            textSetter(value);
            if (value.length > 0) {
              void window.service.window.findInPage(value, true);
            } else {
              void window.service.window.stopFindInPage();
            }
          }}
          onInput={(event: React.FormEvent<HTMLInputElement>) => {
            const value = event.currentTarget.value;
            textSetter(value);
            if (value.length > 0) {
              void window.service.window.findInPage(value, true);
            } else {
              void window.service.window.stopFindInPage();
            }
          }}
          onKeyDown={(event) => {
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
          }}
        />
      </div>
      <Button
        size="small"
        disabled={text.length === 0 || matches < 1}
        onClick={() => {
          if (text.length > 0) {
            void window.service.window.findInPage(text, false);
          }
        }}>
        Previous
      </Button>
      <Button
        size="small"
        disabled={text.length === 0 || matches < 1}
        onClick={() => {
          if (text.length > 0) {
            void window.service.window.findInPage(text, true);
          }
        }}>
        Next
      </Button>
      <Button
        size="small"
        disabled={text.length === 0}
        onClick={() => {
          if (text.length > 0) {
            void window.service.window.findInPage(text, true);
          }
        }}>
        Find
      </Button>
      <Button
        size="small"
        onClick={() => {
          void window.service.window.stopFindInPage(true);
          openSetter(false);
        }}>
        Close
      </Button>
    </Root>
  );
}
