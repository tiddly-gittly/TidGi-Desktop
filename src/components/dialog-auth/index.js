import React from 'react';
import PropTypes from 'prop-types';

import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';

import connectComponent from '../../helpers/connect-component';

import { updateForm, login } from '../../state/dialog-auth/actions';

const { remote } = window.require('electron');

const styles = (theme) => ({
  root: {
    background: theme.palette.background.paper,
    height: '100vh',
    width: '100vw',
    padding: theme.spacing(3),
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

const Auth = ({
  classes, onUpdateForm, onLogin, username, password,
}) => (
  <div className={classes.root}>
    <div className={classes.flexGrow}>
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
    <div>
      <Button variant="contained" className={classes.button} onClick={() => remote.getCurrentWindow().close()}>
        Cancel
      </Button>
      <Button color="primary" variant="contained" className={classes.button} onClick={onLogin}>
        Sign in
      </Button>
    </div>
  </div>
);

Auth.propTypes = {
  classes: PropTypes.object.isRequired,
  onLogin: PropTypes.func.isRequired,
  onUpdateForm: PropTypes.func.isRequired,
  password: PropTypes.string.isRequired,
  username: PropTypes.string.isRequired,
};

const mapStateToProps = (state) => ({
  username: state.dialogAuth.form.username,
  password: state.dialogAuth.form.password,
});

const actionCreators = {
  updateForm,
  login,
};

export default connectComponent(
  Auth,
  mapStateToProps,
  actionCreators,
  styles,
);
