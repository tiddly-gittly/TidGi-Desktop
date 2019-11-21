import PropTypes from 'prop-types';
import React from 'react';

import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';
import Paper from '@material-ui/core/Paper';
import AddCircleIcon from '@material-ui/icons/AddCircle';

import connectComponent from '../../helpers/connect-component';
import { requestOpenInBrowser } from '../../senders';

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

const SubmitAppCard = (props) => {
  const {
    classes,
  } = props;

  return (
    <Grid item>
      <Paper elevation={1} className={classes.card} onClick={() => requestOpenInBrowser('https://github.com/quanglam2807/singlebox/issues/new?template=app.md&title=app%3A+')}>
        <div>
          <AddCircleIcon className={classes.paperIcon} />
        </div>
        <div className={classes.infoContainer}>
          <Typography variant="subtitle1" className={classes.appName}>
            Submit New App
          </Typography>
          <Typography variant="body1" color="textSecondary" className={classes.appUrl}>
            Can&apos;t find your favorite app? Submit it!
          </Typography>
        </div>
      </Paper>
    </Grid>
  );
};

SubmitAppCard.propTypes = {
  classes: PropTypes.object.isRequired,
};


export default connectComponent(
  SubmitAppCard,
  null,
  null,
  styles,
);
