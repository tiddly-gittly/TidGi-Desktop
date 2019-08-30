import PropTypes from 'prop-types';
import React from 'react';

import Button from '@material-ui/core/Button';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';
import Paper from '@material-ui/core/Paper';

import connectComponent from '../../helpers/connect-component';
import isUrl from '../../helpers/is-url';
import extractHostname from '../../helpers/extract-hostname';
import { requestCreateWorkspace } from '../../senders';

const { remote } = window.require('electron');

const styles = (theme) => ({
  card: {
    width: 350,
    boxSizing: 'border-box',
    borderRadius: 4,
    padding: theme.spacing.unit * 1.5,
    display: 'flex',
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
    width: 64,
    height: 64,
    borderRadius: 8,
    boxShadow: 'rgba(0, 0, 0, 0.16) 0px 1px 2px, rgba(0, 0, 0, 0.23) 0px 1px 2px',
  },
  actionContainer: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    paddingLeft: theme.spacing.unit,
    paddingRight: theme.spacing.unit,
  },
  actionButton: {
    minWidth: 'auto',
    boxShadow: 'none',
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

const AppCard = (props) => {
  const {
    classes,
    icon,
    icon128,
    mailtoHandler,
    name,
    url,
  } = props;

  return (
    <Grid item>
      <Paper elevation={1} className={classes.card}>
        <div>
          <img
            alt={name}
            className={classes.paperIcon}
            src={icon128 || (isUrl(icon) ? icon : `file://${icon}`)}
          />
        </div>
        <div className={classes.infoContainer}>
          <Typography variant="subtitle1" className={classes.appName}>
            {name}
          </Typography>
          <Typography variant="body1" color="textSecondary" className={classes.appUrl}>
            {extractHostname(url)}
          </Typography>
        </div>
        <div className={classes.actionContainer}>
          <Button
            className={classes.actionButton}
            color="primary"
            size="medium"
            variant="contained"
            onClick={() => {
              requestCreateWorkspace(name, url, icon128, mailtoHandler);
              remote.getCurrentWindow().close();
            }}
          >
            Add
          </Button>
        </div>
      </Paper>
    </Grid>
  );
};

AppCard.defaultProps = {
  mailtoHandler: null,
  icon128: null,
};

AppCard.propTypes = {
  classes: PropTypes.object.isRequired,
  icon128: PropTypes.string,
  icon: PropTypes.string.isRequired,
  mailtoHandler: PropTypes.string,
  name: PropTypes.string.isRequired,
  url: PropTypes.string.isRequired,
};


export default connectComponent(
  AppCard,
  null,
  null,
  styles,
);
