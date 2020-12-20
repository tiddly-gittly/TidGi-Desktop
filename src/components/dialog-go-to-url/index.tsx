import React from 'react';
import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';
import connectComponent from '../../helpers/connect-component';
import { updateForm, go } from '../../state/dialog-go-to-url/actions';
const styles = (theme: any) => ({
  root: {
    background: theme.palette.background.paper,
    height: '100vh',
    width: '100vw',
    padding: theme.spacing(2),
    display: 'flex',
    flexDirection: 'column',
  },
  flexGrow: {
    flex: 1,
  },
  button: {
    float: 'right',
    marginLeft: theme.spacing(1),
  },
});
interface OwnGoToUrlProps {
  classes: any;
  url: string;
  urlError?: string;
  onUpdateForm: (...arguments_: any[]) => any;
  onGo: (...arguments_: any[]) => any;
}
// @ts-expect-error ts-migrate(2456) FIXME: Type alias 'GoToUrlProps' circularly references it... Remove this comment to see the full error message
type GoToUrlProps = OwnGoToUrlProps & typeof GoToUrl.defaultProps;
// @ts-expect-error ts-migrate(7022) FIXME: 'GoToUrl' implicitly has type 'any' because it doe... Remove this comment to see the full error message
const GoToUrl = ({ classes, url, urlError, onUpdateForm, onGo }: GoToUrlProps) => (
  // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  <div className={classes.root}>
    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
    <div className={classes.flexGrow}>
      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <TextField
        autoFocus
        id="outlined-full-width"
        label="URL"
        error={Boolean(urlError)}
        helperText={urlError}
        placeholder="Type a URL"
        fullWidth
        margin="dense"
        variant="outlined"
        multiline={false}
        InputLabelProps={{
          shrink: true,
        }}
        value={url}
        onChange={(e) => onUpdateForm({ url: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onGo();
            (e.target as any).blur();
          }
        }}
      />
    </div>
    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
    <div>
      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Button color="primary" variant="contained" disableElevation className={classes.button} onClick={onGo}>
        Go
      </Button>
      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Button variant="contained" disableElevation className={classes.button} onClick={() => window.remote.closeCurrentWindow()}>
        Cancel
      </Button>
    </div>
  </div>
);
GoToUrl.defaultProps = {
  urlError: null,
};
const mapStateToProps = (state: any) => ({
  url: state.dialogGoToUrl.form.url,
  urlError: state.dialogGoToUrl.form.urlError,
});
const actionCreators = {
  updateForm,
  go,
};
export default connectComponent(GoToUrl, mapStateToProps, actionCreators, styles);
