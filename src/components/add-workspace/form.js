import React from 'react';
import PropTypes from 'prop-types';

import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';

import connectComponent from '../../helpers/connect-component';
import isUrl from '../../helpers/is-url';
import getMailtoUrl from '../../helpers/get-mailto-url';

import { updateForm, save } from '../../state/add-workspace/actions';

import defaultIcon from '../../images/default-icon.png';

import EnhancedDialogTitle from './enhanced-dialog-title';

const styles = (theme) => ({
  root: {
    background: theme.palette.background.paper,
    height: '100vh',
    width: '100vw',
    padding: theme.spacing.unit * 3,
    display: 'flex',
    flexDirection: 'column',
  },
  flexGrow: {
    flex: 1,
  },
  button: {
    float: 'right',
  },
  textField: {
    marginBottom: theme.spacing.unit * 3,
  },
  avatarFlex: {
    display: 'flex',
  },
  avatarLeft: {
    padding: theme.spacing.unit,
  },
  avatarRight: {
    flex: 1,
    padding: theme.spacing.unit,
  },
  avatar: {
    fontFamily: theme.typography.fontFamily,
    height: 64,
    width: 64,
    background: theme.palette.type === 'dark' ? theme.palette.common.white : theme.palette.common.black,
    borderRadius: 4,
    color: theme.palette.getContrastText(theme.palette.type === 'dark' ? theme.palette.common.white : theme.palette.common.black),
    fontSize: '32px',
    lineHeight: '64px',
    textAlign: 'center',
    fontWeight: 500,
    textTransform: 'uppercase',
    userSelect: 'none',
    boxShadow: theme.shadows[1],
  },
  avatarPicture: {
    height: 64,
    width: 64,
    borderRadius: 4,
  },
  buttonBot: {
    marginTop: theme.spacing.unit,
  },
});

const getValidIconPath = (iconPath) => {
  if (iconPath) {
    if (isUrl(iconPath)) return iconPath;
    return `file://${iconPath}`;
  }
  return defaultIcon;
};

const AddWorkspaceCustom = ({
  classes,
  homeUrl,
  homeUrlError,
  isMailApp,
  name,
  nameError,
  onSave,
  onUpdateForm,
  picturePath,
}) => (
  <div className={classes.root}>
    <EnhancedDialogTitle>
      Add Custom Workspace
    </EnhancedDialogTitle>
    <div>
      <TextField
        id="outlined-full-width"
        label={nameError || 'Name'}
        error={Boolean(nameError)}
        placeholder="Example: Singlebox"
        fullWidth
        margin="dense"
        variant="outlined"
        className={classes.textField}
        InputLabelProps={{
          shrink: true,
        }}
        value={name}
        onChange={(e) => onUpdateForm({ name: e.target.value })}
      />
      <TextField
        id="outlined-full-width"
        label={homeUrlError || 'Home URL'}
        error={Boolean(homeUrlError)}
        placeholder="Example: https://singleboxapp.com"
        fullWidth
        margin="dense"
        variant="outlined"
        className={classes.textField}
        InputLabelProps={{
          shrink: true,
        }}
        value={homeUrl}
        onChange={(e) => onUpdateForm({ homeUrl: e.target.value })}
        helperText={!homeUrlError && isMailApp && 'Email app detected.'}
      />
      <div className={classes.avatarFlex}>
        <div className={classes.avatarLeft}>
          <div className={classes.avatar}>
            <img alt="Icon" className={classes.avatarPicture} src={getValidIconPath(picturePath)} />
          </div>
        </div>
        <div className={classes.avatarRight}>
          <Button
            variant="contained"
            onClick={() => {
              const { remote } = window.require('electron');
              const opts = {
                properties: ['openFile'],
                filters: [
                  { name: 'Images', extensions: ['jpg', 'png'] },
                ],
              };
              remote.dialog.showOpenDialog(remote.getCurrentWindow(), opts)
                .then(({ canceled, filePaths }) => {
                  if (!canceled && filePaths.length > 0) {
                    onUpdateForm({ picturePath: filePaths[0] });
                  }
                });
            }}
          >
            Change Icon
          </Button>
          <br />
          <Button
            variant="contained"
            className={classes.buttonBot}
            onClick={() => onUpdateForm({ picturePath: null })}
          >
            Remove Icon
          </Button>
        </div>
      </div>
    </div>
    <div>
      <Button color="primary" variant="contained" className={classes.button} onClick={onSave}>
        Add
      </Button>
    </div>
  </div>
);

AddWorkspaceCustom.defaultProps = {
  picturePath: null,
  homeUrl: '',
  homeUrlError: null,
  name: '',
  nameError: null,
};

AddWorkspaceCustom.propTypes = {
  classes: PropTypes.object.isRequired,
  homeUrl: PropTypes.string,
  homeUrlError: PropTypes.string,
  isMailApp: PropTypes.bool.isRequired,
  name: PropTypes.string,
  nameError: PropTypes.string,
  onSave: PropTypes.func.isRequired,
  onUpdateForm: PropTypes.func.isRequired,
  picturePath: PropTypes.string,
};

const mapStateToProps = (state) => ({
  homeUrl: state.addWorkspace.form.homeUrl,
  homeUrlError: state.addWorkspace.form.homeUrlError,
  isMailApp: Boolean(getMailtoUrl(state.addWorkspace.form.homeUrl)),
  name: state.addWorkspace.form.name,
  nameError: state.addWorkspace.form.nameError,
  picturePath: state.addWorkspace.form.picturePath,
});

const actionCreators = {
  updateForm,
  save,
};

export default connectComponent(
  AddWorkspaceCustom,
  mapStateToProps,
  actionCreators,
  styles,
);
