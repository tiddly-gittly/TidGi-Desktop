import React from 'react';
import PropTypes from 'prop-types';

import CloseIcon from '@material-ui/icons/Close';
import IconButton from '@material-ui/core/IconButton';
import KeyboardReturnIcon from '@material-ui/icons/KeyboardReturn';
import Paper from '@material-ui/core/Paper';
import Typography from '@material-ui/core/Typography';

import connectComponent from '../../helpers/connect-component';

import {
  resetThenGetHits,
  updateQuery,
} from '../../state/dialog-add-workspace/actions';

const styles = (theme) => ({
  toolbarSearchContainer: {
    flex: 1,
    zIndex: 10,
    position: 'relative',
    borderRadius: 0,
    paddingRight: theme.spacing(1),
    paddingLeft: theme.spacing(1),
  },
  toolbarSectionSearch: {
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'row',
    height: 40,
    margin: '0 auto',
  },
  searchBarText: {
    lineHeight: 1.5,
    padding: '0 4px',
    flex: 1,
    userSelect: 'none',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    transform: 'translateY(-1px)',
    fontWeight: 'normal',
  },
  input: {
    font: 'inherit',
    border: 0,
    display: 'block',
    verticalAlign: 'middle',
    whiteSpace: 'normal',
    background: 'none',
    margin: 0,
    color: theme.palette.text.primary,
    width: '100%',
    paddingLeft: 0,
    '&:focus': {
      outline: 0,
    },
    '&::placeholder': {
      color: theme.palette.text.secondary,
    },
  },
  searchButton: {
    [theme.breakpoints.up('md')]: {
      display: 'none',
    },
  },
  iconButton: {
    padding: theme.spacing(0.5),
  },
});

const SearchBox = ({
  classes,
  onResetThenGetHits,
  onUpdateQuery,
  query,
}) => {
  const clearSearchAction = query.length > 0 && (
    <>
      <IconButton
        color="default"
        className={classes.iconButton}
        aria-label="Clear"
        onClick={() => {
          onUpdateQuery('');
          onResetThenGetHits();
        }}
      >
        <CloseIcon fontSize="small" />
      </IconButton>
      <IconButton
        color="default"
        className={classes.iconButton}
        aria-label="Clear"
        onClick={onResetThenGetHits}
      >
        <KeyboardReturnIcon fontSize="small" />
      </IconButton>
    </>
  );

  return (
    <Paper elevation={1} className={classes.toolbarSearchContainer}>
      <div className={classes.toolbarSectionSearch}>
        <Typography
          className={classes.searchBarText}
          color="inherit"
          variant="body1"
        >
          <input
            className={classes.input}
            onChange={(e) => onUpdateQuery(e.target.value)}
            onInput={(e) => onUpdateQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && query.length > 0) {
                onResetThenGetHits();
              } else if (e.key === 'Escape') {
                e.target.blur();
                onUpdateQuery('');
              }
            }}
            placeholder="Search apps..."
            value={query}
            onFocus={() => {
              window.preventClosingWindow = true;
            }}
            onBlur={() => {
              window.preventClosingWindow = false;
            }}
          />
        </Typography>
        {clearSearchAction}
      </div>
    </Paper>
  );
};

SearchBox.defaultProps = {
  query: '',
};

SearchBox.propTypes = {
  classes: PropTypes.object.isRequired,
  onResetThenGetHits: PropTypes.func.isRequired,
  onUpdateQuery: PropTypes.func.isRequired,
  query: PropTypes.string,
};

const mapStateToProps = (state) => ({
  query: state.dialogAddWorkspace.query,
});

const actionCreators = {
  resetThenGetHits,
  updateQuery,
};

export default connectComponent(
  SearchBox,
  mapStateToProps,
  actionCreators,
  styles,
);
