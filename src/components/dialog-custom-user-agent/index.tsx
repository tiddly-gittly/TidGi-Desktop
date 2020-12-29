import React from 'react';

import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';

import connectComponent from '../../helpers/connect-component';

import { updateForm, save } from '../../state/dialog-custom-user-agent/actions';

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

interface CustomUserAgentProps {
  classes: any;
  code: string;
  onUpdateForm: (...arguments_: any[]) => any;
  onSave: (...arguments_: any[]) => any;
}

const CustomUserAgent = ({ classes, code, onUpdateForm, onSave }: CustomUserAgentProps) => (
  <div className={classes.root}>
    <div className={classes.flexGrow}>
      <TextField
        autoFocus
        id="outlined-full-width"
        label="User-Agent"
        placeholder=""
        helperText="Leave it blank to use default User-Agent string."
        fullWidth
        margin="dense"
        variant="outlined"
        multiline={false}
        InputLabelProps={{
          shrink: true,
        }}
        value={code}
        onChange={(e) => onUpdateForm({ code: e.target.value })}
      />
    </div>
    <div>
      <Button color="primary" variant="contained" disableElevation className={classes.button} onClick={onSave}>
        Save
      </Button>
      <Button variant="contained" disableElevation className={classes.button} onClick={() => window.remote.closeCurrentWindow()}>
        Cancel
      </Button>
    </div>
  </div>
);

const mapStateToProps = (state: any) => ({
  code: state.dialogCustomUserAgent.form.code || '',
});

const actionCreators = {
  updateForm,
  save,
};

export default connectComponent(CustomUserAgent, mapStateToProps, actionCreators, styles);
