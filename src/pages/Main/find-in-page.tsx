import React, { useCallback, useEffect, useRef } from 'react';
import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';
import connectComponent from '../../helpers/connect-component';
import { closeFindInPage, updateFindInPageText } from '../../state/find-in-page/actions';

const styles = (theme: any) => ({
  root: {
    background: theme.palette.background.default,
    display: 'flex',
    alignItems: 'center',
    padding: '0 4px',
    zIndex: 1,
    height: 41,
    borderBottom: '1px solid rgba(0, 0, 0, 0.2)',
    width: '100%',
  },
  infoContainer: {
    flex: 1,
    padding: '0 12px',
  },
});
interface FindInPageProps {
  activeMatch: number;
  classes: any;
  matches: number;
  onCloseFindInPage: (...arguments_: any[]) => any;
  onUpdateFindInPageText: (...arguments_: any[]) => any;
  open: boolean;
  text: string;
}
const FindInPage = (props: FindInPageProps) => {
  const { activeMatch, classes, matches, onCloseFindInPage, onUpdateFindInPageText, open, text } = props;
  const inputReference = useRef(null);
  // https://stackoverflow.com/a/57556594
  // Event handler utilizing useCallback ...
  // ... so that reference never changes.
  const handleOpenFindInPage = useCallback(() => {
    inputReference.current.focus();
    inputReference.current.select();
  }, [inputReference]);
  useEffect(() => {
    const { ipcRenderer } = window.remote;
    ipcRenderer.on('open-find-in-page', handleOpenFindInPage);
    // Remove event listener on cleanup
    return () => {
      ipcRenderer.removeListener('open-find-in-page', handleOpenFindInPage);
    };
  }, [handleOpenFindInPage]);
  if (!open) {
    return null;
  }
  return (
    <div className={classes.root}>
      <div className={classes.infoContainer}>
        <Typography variant="body2">
          <strong>{activeMatch}</strong>
          <span> / </span>
          <strong>{matches}</strong>
          <span> matches</span>
        </Typography>
      </div>
      <div>
        <TextField
          autoFocus
          inputRef={inputReference}
          placeholder="Find"
          value={text}
          margin="dense"
          onChange={(e) => {
            const value = e.target.value;
            onUpdateFindInPageText(value);
            if (value.length > 0) {
              void window.service.window.findInPage(value, true);
            } else {
              void window.service.window.stopFindInPage();
            }
          }}
          onInput={(e) => {
            const value = (e.target as any).value;
            onUpdateFindInPageText(value);
            if (value.length > 0) {
              void window.service.window.findInPage(value, true);
            } else {
              void window.service.window.stopFindInPage();
            }
          }}
          onKeyDown={(e) => {
            if ((e.keyCode || e.which) === 13) {
              // Enter
              const value = (e.target as any).value;
              if (value.length > 0) {
                void window.service.window.findInPage(value, true);
              }
            }
            if ((e.keyCode || e.which) === 27) {
              // Escape
              void window.service.window.stopFindInPage(true);
              onCloseFindInPage();
            }
          }}
        />
      </div>
      <Button
        size="small"
        disabled={text.length < 1 || matches < 1}
        onClick={() => {
          if (text.length > 0) {
            void window.service.window.findInPage(text, false);
          }
        }}>
        Previous
      </Button>
      <Button
        size="small"
        disabled={text.length < 1 || matches < 1}
        onClick={() => {
          if (text.length > 0) {
            void window.service.window.findInPage(text, true);
          }
        }}>
        Next
      </Button>
      <Button
        size="small"
        disabled={text.length < 1}
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
          onCloseFindInPage();
        }}>
        Close
      </Button>
    </div>
  );
};
const mapStateToProps = (state: any) => ({
  open: state.findInPage.open,
  activeMatch: state.findInPage.activeMatch,
  matches: state.findInPage.matches,
  text: state.findInPage.text,
});
const actionCreators = {
  closeFindInPage,
  updateFindInPageText,
};
export default connectComponent(FindInPage, mapStateToProps, actionCreators, styles);
