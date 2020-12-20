import React from 'react';

import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';

import connectComponent from '../../helpers/connect-component';

import { updateForm, login } from '../../state/dialog-auth/actions';

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

  textField: {
    marginBottom: theme.spacing(2),
  },
});

interface AuthProps {
  classes: any;
  onLogin: (...arguments_: any[]) => any;
  onUpdateForm: (...arguments_: any[]) => any;
  password: string;
  username: string;
}

const Auth = ({ classes, onUpdateForm, onLogin, username, password }: AuthProps) => (
  // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  <div className={classes.root}>
    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
    <div className={classes.flexGrow}>
      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <TextField
        className={classes.textField}
        fullWidth
        id="outlined-full-width"
        label="Username"
        margin="dense"
        onChange={(e) => onUpdateForm({ username: e.target.value })}
        placeholder=""
        value={username}
        variant="outlined"
        InputLabelProps={{
          shrink: true,
        }}
      />
      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <TextField
        fullWidth
        id="outlined-full-width"
        label="Password"
        margin="dense"
        onChange={(e) => onUpdateForm({ password: e.target.value })}
        placeholder=""
        type="password"
        value={password}
        variant="outlined"
        InputLabelProps={{
          shrink: true,
        }}
      />
    </div>
    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
    <div>
      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Button color="primary" variant="contained" disableElevation className={classes.button} onClick={onLogin}>
        Sign in
      </Button>
      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Button variant="contained" disableElevation className={classes.button} onClick={() => window.remote.closeCurrentWindow()}>
        Cancel
      </Button>
    </div>
  </div>
);

const mapStateToProps = (state: any) => ({
  username: state.dialogAuth.form.username,
  password: state.dialogAuth.form.password,
});

const actionCreators = {
  updateForm,
  login,
};

export default connectComponent(Auth, mapStateToProps, actionCreators, styles);
