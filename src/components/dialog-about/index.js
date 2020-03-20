import React from 'react';
import PropTypes from 'prop-types';

import Button from '@material-ui/core/Button';
import Typography from '@material-ui/core/Typography';
import DialogContent from '@material-ui/core/DialogContent';

import connectComponent from '../../helpers/connect-component';

import { requestOpenInBrowser } from '../../senders';

const styles = (theme) => ({
  icon: {
    height: 96,
    width: 96,
  },
  dialogContent: {
    minWidth: 320,
    textAlign: 'center',
  },
  title: {
    marginTop: theme.spacing(1),
  },
  version: {
    marginBottom: theme.spacing(2),
  },
  versionSmallContainer: {
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
  versionSmall: {
    fontSize: 13,
  },
  goToTheWebsiteButton: {
    marginRight: theme.spacing(1),
  },
  madeBy: {
    marginTop: theme.spacing(2),
  },
  link: {
    fontWeight: 600,
    cursor: 'pointer',
    '&:hover': {
      textDecoration: 'underline',
    },
  },
});

const About = (props) => {
  const {
    classes,
  } = props;

  return (
    <div>
      <DialogContent className={classes.dialogContent}>
        <img src={`file://${window.iconPath}`} alt="Singlebox" className={classes.icon} />
        <Typography variant="h6" className={classes.title}>Singlebox</Typography>
        <Typography
          variant="body2"
          className={classes.version}
        >
          {`Version v${window.require('electron').remote.app.getVersion()}.`}
        </Typography>

        <Button
          onClick={() => requestOpenInBrowser('https://singleboxapp.com')}
        >
          Website
        </Button>
        <br />
        <Button
          onClick={() => requestOpenInBrowser('https://atomery.com/support?app=singlebox')}
        >
          Support
        </Button>

        <Typography variant="body2" className={classes.madeBy}>
          <span>Made with </span>
          <span role="img" aria-label="love">❤</span>
          <span> by </span>
          <span
            onClick={() => requestOpenInBrowser('https://atomery.com/')}
            onKeyDown={() => requestOpenInBrowser('https://atomery.com/')}
            role="link"
            tabIndex="0"
            className={classes.link}
          >
            Atomery
          </span>
        </Typography>
      </DialogContent>
    </div>
  );
};

About.propTypes = {
  classes: PropTypes.object.isRequired,
};

export default connectComponent(
  About,
  null,
  null,
  styles,
);
