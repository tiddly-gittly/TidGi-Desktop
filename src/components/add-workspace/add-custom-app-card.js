import PropTypes from 'prop-types';
import React from 'react';

import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';
import Paper from '@material-ui/core/Paper';
import CreateIcon from '@material-ui/icons/Create';

import connectComponent from '../../helpers/connect-component';

import { updateMode } from '../../state/add-workspace/actions';

const styles = (theme) => ({
  card: {
    width: 350,
    boxSizing: 'border-box',
    borderRadius: 4,
    padding: theme.spacing.unit * 1.5,
    display: 'flex',
    cursor: 'pointer',
    color: theme.palette.text.primary,
    '&:hover, &:focus': {
      backgroundColor: theme.palette.action.selected,
    },
    textAlign: 'left',
  },
  appName: {
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    lineHeight: 1,
    fontWeight: 500,
  },
  appUrl: {
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  paperIcon: {
    fontSize: '64px',
  },
  infoContainer: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    paddingLeft: theme.spacing.unit,
    paddingRight: theme.spacing.unit,
    flex: 1,
  },
});

const AddCustomAppCard = (props) => {
  const {
    classes,
    onUpdateMode,
  } = props;

  return (
    <Grid item>
      <Paper elevation={1} className={classes.card} onClick={() => onUpdateMode('custom')}>
        <div>
          <CreateIcon className={classes.paperIcon} />
        </div>
        <div className={classes.infoContainer}>
          <Typography variant="subtitle1" className={classes.appName}>
            Add Custom App
          </Typography>
          <Typography variant="body1" color="textSecondary" className={classes.appUrl}>
            Make it your own!
          </Typography>
        </div>
      </Paper>
    </Grid>
  );
};

AddCustomAppCard.propTypes = {
  classes: PropTypes.object.isRequired,
  onUpdateMode: PropTypes.func.isRequired,
};

const actionCreators = {
  updateMode,
};

export default connectComponent(
  AddCustomAppCard,
  null,
  actionCreators,
  styles,
);
