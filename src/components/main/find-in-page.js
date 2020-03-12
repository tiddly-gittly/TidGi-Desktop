import React from 'react';
import PropTypes from 'prop-types';

import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';

import connectComponent from '../../helpers/connect-component';

import { closeFindInPage, updateFindInPageText } from '../../state/find-in-page/actions';

import {
  requestFindInPage,
  requestStopFindInPage,
} from '../../senders';

const styles = (theme) => ({
  root: {
    background: theme.palette.background.default,
    display: 'flex',
    alignItems: 'center',
    padding: '0 4px',
    zIndex: 1,
    height: 41, // need to have fixed height
    borderBottom: '1px solid rgba(0, 0, 0, 0.2)',
    width: '100%',
  },
  infoContainer: {
    flex: 1,
    padding: '0 12px',
  },
});

const FindInPage = (props) => {
  const {
    activeMatch,
    classes,
    inputRef,
    matches,
    onCloseFindInPage,
    onUpdateFindInPageText,
    open,
    text,
  } = props;

  if (!open) return null;

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
          inputRef={inputRef}
          placeholder="Find"
          value={text}
          margin="dense"
          onChange={(e) => {
            const val = e.target.value;
            onUpdateFindInPageText(val);
            if (val.length > 0) {
              requestFindInPage(val, true);
            } else {
              requestStopFindInPage();
            }
          }}
          onInput={(e) => {
            const val = e.target.value;
            onUpdateFindInPageText(val);
            if (val.length > 0) {
              requestFindInPage(val, true);
            } else {
              requestStopFindInPage();
            }
          }}
          onKeyDown={(e) => {
            if ((e.keyCode || e.which) === 13) { // Enter
              const val = e.target.value;
              if (val.length > 0) {
                requestFindInPage(val, true);
              }
            }
            if ((e.keyCode || e.which) === 27) { // Escape
              requestStopFindInPage(true);
              onCloseFindInPage();
            }
          }}
        />
      </div>
      <Button
        size="small"
        onClick={() => {
          if (text.length > 0) {
            requestFindInPage(text, false);
          }
        }}
      >
        Previous
      </Button>
      <Button
        size="small"
        onClick={() => {
          if (text.length > 0) {
            requestFindInPage(text, true);
          }
        }}
      >
        Next
      </Button>
      <Button
        size="small"
        onClick={() => {
          if (text.length > 0) {
            requestFindInPage(text, true);
          }
        }}
      >
        Find
      </Button>
      <Button
        size="small"
        onClick={() => {
          requestStopFindInPage(true);
          onCloseFindInPage();
        }}
      >
        Close
      </Button>
    </div>
  );
};

FindInPage.defaultProps = {
  inputRef: null,
};

FindInPage.propTypes = {
  activeMatch: PropTypes.number.isRequired,
  classes: PropTypes.object.isRequired,
  inputRef: PropTypes.func,
  matches: PropTypes.number.isRequired,
  onCloseFindInPage: PropTypes.func.isRequired,
  onUpdateFindInPageText: PropTypes.func.isRequired,
  open: PropTypes.bool.isRequired,
  text: PropTypes.string.isRequired,
};

const mapStateToProps = (state) => ({
  open: state.findInPage.open,
  activeMatch: state.findInPage.activeMatch,
  matches: state.findInPage.matches,
  text: state.findInPage.text,
});

const actionCreators = {
  closeFindInPage,
  updateFindInPageText,
};

export default connectComponent(
  FindInPage,
  mapStateToProps,
  actionCreators,
  styles,
);
