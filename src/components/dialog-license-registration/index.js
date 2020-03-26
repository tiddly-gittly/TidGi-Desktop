import React from 'react';
import PropTypes from 'prop-types';

import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';
import DialogContentText from '@material-ui/core/DialogContentText';

import connectComponent from '../../helpers/connect-component';

import {
  updateForm,
  register,
} from '../../state/dialog-license-registration/actions';

import { requestOpenInBrowser } from '../../senders';

const styles = (theme) => ({
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
  dialogContentText: {
    marginTop: theme.spacing(1),
  },
  actions: {
    display: 'flex',
  },
  button: {
    float: 'right',
    marginLeft: theme.spacing(1),
  },
});

const DialogLicenseRegistration = (props) => {
  const {
    classes,
    licenseKey,
    licenseKeyError,
    onUpdateForm,
    onRegister,
  } = props;

  return (
    <div className={classes.root}>
      <div className={classes.flexGrow}>
        <DialogContentText className={classes.dialogContentText}>
          You are currently running a trial version of Singlebox which only
          lets you add up to two workspaces.
          To remove the trial limitations, please purchase a
          perpetual license key ($9.99) from our store.
        </DialogContentText>
        <TextField
          autoFocus
          fullWidth
          id=""
          label="License Key"
          margin="normal"
          onChange={(e) => onUpdateForm({ licenseKey: e.target.value })}
          value={licenseKey}
          placeholder="0-0000000000000-00000000-00000000-00000000-00000000"
          error={Boolean(licenseKeyError)}
          variant="outlined"
          helperText={licenseKeyError || 'If you have already purchased Singlebox from our store, you should have received a license key via email to enter above.'}
        />
      </div>
      <div className={classes.actions}>
        <div style={{ flex: 1 }}>
          <Button
            onClick={() => requestOpenInBrowser('https://webcatalog.onfastspring.com/singlebox/singleboxapp?utm_source=singlebox_app')}
          >
            Visit Store...
          </Button>
        </div>
        <div>
          <Button
            color="primary"
            variant="contained"
            disableElevation
            className={classes.button}
            onClick={onRegister}
          >
            Register
          </Button>
          <Button variant="contained" disableElevation className={classes.button} onClick={() => window.require('electron').remote.getCurrentWindow().close()}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};

DialogLicenseRegistration.defaultProps = {
  licenseKey: '',
  licenseKeyError: null,
};

DialogLicenseRegistration.propTypes = {
  classes: PropTypes.object.isRequired,
  licenseKey: PropTypes.string,
  licenseKeyError: PropTypes.string,
  onRegister: PropTypes.func.isRequired,
  onUpdateForm: PropTypes.func.isRequired,
};

const mapStateToProps = (state) => {
  const {
    form: {
      licenseKey,
      licenseKeyError,
    },
  } = state.dialogLicenseRegistration;

  return {
    licenseKey,
    licenseKeyError,
  };
};

const actionCreators = {
  updateForm,
  register,
};

export default connectComponent(
  DialogLicenseRegistration,
  mapStateToProps,
  actionCreators,
  styles,
);
