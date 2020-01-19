import React from 'react';
import PropTypes from 'prop-types';

import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';
import Divider from '@material-ui/core/Divider';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import ListItemSecondaryAction from '@material-ui/core/ListItemSecondaryAction';
import Switch from '@material-ui/core/Switch';
import Typography from '@material-ui/core/Typography';

import connectComponent from '../../helpers/connect-component';
import getMailtoUrl from '../../helpers/get-mailto-url';

import defaultIcon from '../../images/default-icon.png';

import {
  getIconFromInternet,
  save,
  updateForm,
} from '../../state/edit-workspace/actions';

const styles = (theme) => ({
  root: {
    background: theme.palette.background.paper,
    height: '100vh',
    width: '100vw',
    paddingTop: theme.spacing.unit * 3,
    paddingBottom: theme.spacing.unit * 3,
    paddingLeft: theme.spacing.unit * 2,
    paddingRight: theme.spacing.unit * 2,
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
    paddingTop: theme.spacing.unit,
    paddingBottom: theme.spacing.unit,
    paddingLeft: 0,
    paddingRight: theme.spacing.unit,
  },
  avatarRight: {
    flex: 1,
    paddingTop: theme.spacing.unit,
    paddingBottom: theme.spacing.unit,
    paddingLeft: theme.spacing.unit,
    paddingRight: 0,
  },
  avatar: {
    fontFamily: theme.typography.fontFamily,
    height: 64,
    width: 64,
    background: theme.palette.type === 'dark' ? theme.palette.common.black : theme.palette.common.white,
    borderRadius: 4,
    color: theme.palette.getContrastText(theme.palette.type === 'dark' ? theme.palette.common.black : theme.palette.common.white),
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
}) => (
  <div className={classes.root}>
    <div className={classes.flexGrow}>
      <TextField
        id="outlined-full-width"
        label={nameError || 'Name'}
        error={Boolean(nameError)}
        placeholder="Optional"
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
        placeholder="Optional"
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
                  { name: 'Images', extensions: ['png', 'jpg', 'jpeg'] },
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
          <Typography variant="caption">
            PNG or JPEG.
          </Typography>
          <Button
            variant="outlined"
            size="small"
            className={classes.buttonBot}
            disabled={!homeUrl || homeUrlError || downloadingIcon}
            onClick={() => onGetIconFromInternet(true)}
          >
            {downloadingIcon ? 'Downloading Icon from the Internet...' : 'Download Icon from the Internet'}
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
        </div>
      </div>
      <List>
        <Divider />
        <ListItem disableGutters>
          <ListItemText primary="Hibernate when not used" secondary="Save CPU usage, memory and battery." />
          <ListItemSecondaryAction>
            <Switch
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
              color="primary"
              checked={disableAudio}
              onChange={(e) => onUpdateForm({ disableAudio: e.target.checked })}
            />
          </ListItemSecondaryAction>
        </ListItem>
      </List>
    </div>
    <div>
      <Button color="primary" variant="contained" className={classes.button} onClick={onSave}>
        Save
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
};

const mapStateToProps = (state) => ({
  disableAudio: Boolean(state.editWorkspace.form.disableAudio),
  disableNotifications: Boolean(state.editWorkspace.form.disableNotifications),
  downloadingIcon: state.editWorkspace.downloadingIcon,
  hibernateWhenUnused: Boolean(state.editWorkspace.form.hibernateWhenUnused),
  homeUrl: state.editWorkspace.form.homeUrl,
  homeUrlError: state.editWorkspace.form.homeUrlError,
  id: state.editWorkspace.form.id,
  internetIcon: state.editWorkspace.form.internetIcon,
  isMailApp: Boolean(getMailtoUrl(state.editWorkspace.form.homeUrl)),
  name: state.editWorkspace.form.name,
  nameError: state.editWorkspace.form.nameError,
  order: state.editWorkspace.form.order,
  picturePath: state.editWorkspace.form.picturePath,
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
