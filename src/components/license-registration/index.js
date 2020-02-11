import React from 'react';
import PropTypes from 'prop-types';

import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogActions from '@material-ui/core/DialogActions';

import connectComponent from '../../helpers/connect-component';

import {
  updateForm,
  register,
} from '../../state/license-registration/actions';

import { requestOpenInBrowser } from '../../senders';

const styles = (theme) => ({
  dialogContentText: {
    marginTop: theme.spacing.unit * 2,
  },
  dialogActions: {
    borderTop: `1px solid ${theme.palette.divider}`,
    margin: 0,
    padding: theme.spacing.unit,
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
    <div>
      <DialogContent>
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
      </DialogContent>
      <DialogActions className={classes.dialogActions}>
        <div style={{ flex: 1 }}>
          <Button
            onClick={() => requestOpenInBrowser('https://webcatalog.onfastspring.com/singlebox/singleboxapp')}
          >
            Visit Store...
          </Button>
        </div>
        <Button
          color="primary"
          onClick={onRegister}
        >
          Register
        </Button>
      </DialogActions>
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
  } = state.licenseRegistration;

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
