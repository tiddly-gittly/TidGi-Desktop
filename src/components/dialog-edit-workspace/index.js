import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';

import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';
import Divider from '@material-ui/core/Divider';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import ListItemSecondaryAction from '@material-ui/core/ListItemSecondaryAction';
import Switch from '@material-ui/core/Switch';
import Typography from '@material-ui/core/Typography';
import FormGroup from '@material-ui/core/FormGroup';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Checkbox from '@material-ui/core/Checkbox';

import connectComponent from '../../helpers/connect-component';
import getMailtoUrl from '../../helpers/get-mailto-url';

import defaultIcon from '../../images/default-icon.png';

import {
  getIconFromInternet,
  save,
  updateForm,
} from '../../state/dialog-edit-workspace/actions';

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
  button: {
    float: 'right',
    marginLeft: theme.spacing(1),
  },
  textField: {
    marginBottom: theme.spacing(3),
  },
  avatarFlex: {
    display: 'flex',
  },
  avatarLeft: {
    paddingTop: theme.spacing(1),
    paddingBottom: theme.spacing(1),
    paddingLeft: 0,
    paddingRight: theme.spacing(1),
  },
  avatarRight: {
    flex: 1,
    paddingTop: theme.spacing(1),
    paddingBottom: theme.spacing(1),
    paddingLeft: theme.spacing(1),
    paddingRight: 0,
  },
  avatar: {
    fontFamily: theme.typography.fontFamily,
    height: 64,
    width: 64,
    background: theme.palette.common.white,
    borderRadius: 4,
    color: theme.palette.getContrastText(theme.palette.common.white),
    fontSize: '32px',
    lineHeight: '64px',
    textAlign: 'center',
    fontWeight: 500,
    textTransform: 'uppercase',
    userSelect: 'none',
    border: theme.palette.type === 'dark' ? 'none' : '1px solid rgba(0, 0, 0, 0.12)',
    overflow: 'hidden',
  },
  transparentAvatar: {
    background: 'transparent',
    border: 'none',
    borderRadius: 0,
  },
  avatarPicture: {
    height: '100%',
    width: '100%',
  },
  buttonBot: {
    marginTop: theme.spacing(1),
  },
  caption: {
    display: 'block',
  },
});

const getValidIconPath = (iconPath, internetIcon) => {
  if (iconPath) {
    return `file://${iconPath}`;
  }
  if (internetIcon) {
    return internetIcon;
  }
  return defaultIcon;
};

const EditWorkspace = ({
  classes,
  disableAudio,
  disableNotifications,
  downloadingIcon,
  hibernateWhenUnused,
  homeUrl,
  homeUrlError,
  internetIcon,
  isMailApp,
  name,
  nameError,
  onGetIconFromInternet,
  onSave,
  onUpdateForm,
  picturePath,
  transparentBackground,
}) => (
  <div className={classes.root}>
    <div className={classes.flexGrow}>
      <TextField
        id="outlined-full-width"
        label="Name"
        error={Boolean(nameError)}
        placeholder="Optional"
        helperText={nameError}
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
        label="Home URL"
        error={Boolean(homeUrlError)}
        placeholder="Optional"
        helperText={homeUrlError || (isMailApp && 'Email app detected.')}
        fullWidth
        margin="dense"
        variant="outlined"
        className={classes.textField}
        InputLabelProps={{
          shrink: true,
        }}
        value={homeUrl}
        onChange={(e) => onUpdateForm({ homeUrl: e.target.value })}
      />
      <div className={classes.avatarFlex}>
        <div className={classes.avatarLeft}>
          <div
            className={classNames(
              classes.avatar,
              transparentBackground && classes.transparentAvatar,
            )}
          >
            <img
              alt="Icon"
              className={classes.avatarPicture}
              src={getValidIconPath(picturePath, internetIcon)}
            />
          </div>
        </div>
        <div className={classes.avatarRight}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              const { remote } = window.require('electron');
              const opts = {
                properties: ['openFile'],
                filters: [
                  { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'tiff', 'tif', 'bmp', 'dib'] },
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
            Select Local Image...
          </Button>
          <Typography variant="caption" className={classes.caption}>
            PNG, JPEG, GIF, TIFF or BMP.
          </Typography>
          <Button
            variant="outlined"
            size="small"
            className={classes.buttonBot}
            disabled={!homeUrl || homeUrlError || downloadingIcon}
            onClick={() => onGetIconFromInternet(true)}
          >
            {downloadingIcon ? 'Downloading Icon...' : 'Download Icon from the Internet'}
          </Button>
          <br />
          <Button
            variant="outlined"
            size="small"
            className={classes.buttonBot}
            onClick={() => onUpdateForm({ picturePath: null, internetIcon: null })}
            disabled={!(picturePath || internetIcon)}
          >
            Reset to Default
          </Button>
          <FormGroup>
            <FormControlLabel
              control={(
                <Checkbox
                  checked={transparentBackground}
                  onChange={(e) => onUpdateForm({ transparentBackground: e.target.checked })}
                />
              )}
              label="Use transparent background"
            />
          </FormGroup>
        </div>
      </div>
      <List>
        <Divider />
        <ListItem disableGutters>
          <ListItemText primary="Hibernate when not used" secondary="Save CPU usage, memory and battery." />
          <ListItemSecondaryAction>
            <Switch
              edge="end"
              color="primary"
              checked={hibernateWhenUnused}
              onChange={(e) => onUpdateForm({ hibernateWhenUnused: e.target.checked })}
            />
          </ListItemSecondaryAction>
        </ListItem>
        <ListItem disableGutters>
          <ListItemText primary="Disable notifications" secondary="Prevent workspace from sending notifications." />
          <ListItemSecondaryAction>
            <Switch
              edge="end"
              color="primary"
              checked={disableNotifications}
              onChange={(e) => onUpdateForm({ disableNotifications: e.target.checked })}
            />
          </ListItemSecondaryAction>
        </ListItem>
        <ListItem disableGutters>
          <ListItemText primary="Disable audio" secondary="Prevent workspace from playing audio." />
          <ListItemSecondaryAction>
            <Switch
              edge="end"
              color="primary"
              checked={disableAudio}
              onChange={(e) => onUpdateForm({ disableAudio: e.target.checked })}
            />
          </ListItemSecondaryAction>
        </ListItem>
      </List>
    </div>
    <div>
      <Button color="primary" variant="contained" disableElevation className={classes.button} onClick={onSave}>
        Save
      </Button>
      <Button variant="contained" disableElevation className={classes.button} onClick={() => window.require('electron').remote.getCurrentWindow().close()}>
        Cancel
      </Button>
    </div>
  </div>
);

EditWorkspace.defaultProps = {
  homeUrlError: null,
  internetIcon: null,
  nameError: null,
  picturePath: null,
};

EditWorkspace.propTypes = {
  classes: PropTypes.object.isRequired,
  disableAudio: PropTypes.bool.isRequired,
  disableNotifications: PropTypes.bool.isRequired,
  downloadingIcon: PropTypes.bool.isRequired,
  hibernateWhenUnused: PropTypes.bool.isRequired,
  homeUrl: PropTypes.string.isRequired,
  homeUrlError: PropTypes.string,
  internetIcon: PropTypes.string,
  isMailApp: PropTypes.bool.isRequired,
  name: PropTypes.string.isRequired,
  nameError: PropTypes.string,
  onGetIconFromInternet: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  onUpdateForm: PropTypes.func.isRequired,
  picturePath: PropTypes.string,
  transparentBackground: PropTypes.bool.isRequired,
};

const mapStateToProps = (state) => ({
  disableAudio: Boolean(state.dialogEditWorkspace.form.disableAudio),
  disableNotifications: Boolean(state.dialogEditWorkspace.form.disableNotifications),
  downloadingIcon: state.dialogEditWorkspace.downloadingIcon,
  hibernateWhenUnused: Boolean(state.dialogEditWorkspace.form.hibernateWhenUnused),
  homeUrl: state.dialogEditWorkspace.form.homeUrl || '',
  homeUrlError: state.dialogEditWorkspace.form.homeUrlError,
  id: state.dialogEditWorkspace.form.id || '',
  internetIcon: state.dialogEditWorkspace.form.internetIcon,
  isMailApp: Boolean(getMailtoUrl(state.dialogEditWorkspace.form.homeUrl)),
  name: state.dialogEditWorkspace.form.name || '',
  nameError: state.dialogEditWorkspace.form.nameError,
  picturePath: state.dialogEditWorkspace.form.picturePath,
  transparentBackground: Boolean(state.dialogEditWorkspace.form.transparentBackground),
});

const actionCreators = {
  getIconFromInternet,
  updateForm,
  save,
};

export default connectComponent(
  EditWorkspace,
  mapStateToProps,
  actionCreators,
  styles,
);
