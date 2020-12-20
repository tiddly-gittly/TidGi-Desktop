import React from 'react';
import Button from '@material-ui/core/Button';
import Typography from '@material-ui/core/Typography';
import DialogContent from '@material-ui/core/DialogContent';
import connectComponent from '../../helpers/connect-component';
import { requestOpen } from '../../senders';
const styles = (theme: any) => ({
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
interface AboutProps {
  classes: any;
}
const About = (props: AboutProps) => {
  const { classes } = props;
  const versions = [
    { name: 'Electron Version', version: window.remote.getEnvironmentVersions().electron },
    { name: 'Node Version', version: window.remote.getEnvironmentVersions().node },
    { name: 'Chromium Version', version: window.remote.getEnvironmentVersions().chrome },
  ];
  return (
    // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div>
      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <DialogContent className={classes.dialogContent}>
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <img src={`file:///${(window.meta as any).iconPath}`} alt="TiddlyGit" className={classes.icon} />
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Typography variant="h6" className={classes.title}>
          TiddlyGit
        </Typography>
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Typography variant="body2" className={classes.version}>
          {`Version v${window.remote.getAppVersion()}.`}
        </Typography>
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className={classes.versionSmallContainer}>
          {versions.map(({ name, version }) => (
            // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <Typography key={name} variant="body2" className={classes.versionSmall}>
              {name}: {version}
            </Typography>
          ))}
        </div>

        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Button onClick={() => requestOpen('https://github.com/tiddly-gittly/TiddlyGit-Desktop')}>Website</Button>
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <br />
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Button onClick={() => requestOpen('https://github.com/tiddly-gittly/TiddlyGit-Desktop/issues/new/choose')}>Support</Button>

        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Typography variant="body2" className={classes.madeBy}>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <span>Made with </span>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <span role="img" aria-label="love">
            ❤
          </span>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <span> by </span>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <span
            // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
            onClick={() => requestOpen('https://onetwo.ren/wiki/')}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') {
                return;
              }
              // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
              requestOpen('https://onetwo.ren/wiki/');
            }}
            role="link"
            // @ts-expect-error ts-migrate(2322) FIXME: Type 'string' is not assignable to type 'number | ... Remove this comment to see the full error message
            tabIndex="0"
            className={classes.link}>
            Lin Onetwo
          </span>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <span> and </span>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <span
            // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
            onClick={() => requestOpen('https://webcatalog.app/?utm_source=tiddlygit_app')}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') {
                return;
              }
              // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
              requestOpen('https://webcatalog.app/?utm_source=tiddlygit_app');
            }}
            role="link"
            // @ts-expect-error ts-migrate(2322) FIXME: Type 'string' is not assignable to type 'number | ... Remove this comment to see the full error message
            tabIndex="0"
            className={classes.link}>
            WebCatalog
          </span>
        </Typography>
      </DialogContent>
    </div>
  );
};
export default connectComponent(About, null, null, styles);
