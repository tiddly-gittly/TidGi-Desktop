import React from 'react';
import PropTypes from 'prop-types';

import Button from '@material-ui/core/Button';
import Typography from '@material-ui/core/Typography';
import DialogContent from '@material-ui/core/DialogContent';

import connectComponent from '../../helpers/connect-component';

import { requestOpen } from '../../senders';

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
    fontSize: '0.8rem',
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

  const versions = [
    { name: 'Electron Version', version: window.remote.getEnvironmentVersions().electron },
    { name: 'Node Version', version: window.remote.getEnvironmentVersions().node },
    { name: 'Chromium Version', version: window.remote.getEnvironmentVersions().chrome },
  ];

  return (
    <div>
      <DialogContent className={classes.dialogContent}>
        <img src={`file:///${window.meta.iconPath}`} alt="TiddlyGit" className={classes.icon} />
        <Typography variant="h6" className={classes.title}>TiddlyGit</Typography>
        <Typography
          variant="body2"
          className={classes.version}
        >
          {`Version v${window.remote.getAppVersion()}.`}
        </Typography>
        <div className={classes.versionSmallContainer}>
          {versions.map(({ name, version }) => (
            <Typography key={name} variant="body2" className={classes.versionSmall}>
              {name}
              :
              {' '}
              {version}
            </Typography>
          ))}
        </div>


        <Button
          onClick={() => requestOpen('https://github.com/tiddly-gittly/TiddlyGit-Desktop')}
        >
          Website
        </Button>
        <br />
        <Button
          onClick={() => requestOpen('https://github.com/tiddly-gittly/TiddlyGit-Desktop/issues/new/choose')}
        >
          Support
        </Button>

        <Typography variant="body2" className={classes.madeBy}>
          <span>Made with </span>
          <span role="img" aria-label="love">❤</span>
          <span> by </span>
          <span
            onClick={() => requestOpen('https://onetwo.ren/wiki/')}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              requestOpen('https://onetwo.ren/wiki/');
            }}
            role="link"
            tabIndex="0"
            className={classes.link}
          >
            Lin Onetwo
          </span>
          <span> and </span>
          <span
            onClick={() => requestOpen('https://atomery.com?utm_source=tiddlygit')}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              requestOpen('https://atomery.com?utm_source=tiddlygit');
            }}
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
