import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';

import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';
import Divider from '@material-ui/core/Divider';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import ListItemSecondaryAction from '@material-ui/core/ListItemSecondaryAction';
import Switch from '@material-ui/core/Switch';
import Typography from '@material-ui/core/Typography';
import Autocomplete from '@material-ui/lab/Autocomplete';

import connectComponent from '../../helpers/connect-component';
import getMailtoUrl from '../../helpers/get-mailto-url';

import defaultIcon from '../../images/default-icon.png';

import { save, updateForm } from '../../state/dialog-edit-workspace/actions';
import { getSubWikiPluginContent } from '../../senders';

const styles = theme => ({
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
    height: 85,
    width: 85,
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
    return `file:///${iconPath}`;
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
  port,
  homeUrlError,
  internetIcon,
  isMailApp,
  name,
  nameError,
  onSave,
  onUpdateForm,
  mainWikiToLink,
  tagName,
  picturePath,
  transparentBackground,
  isSubWiki,
}) => {
  const { t } = useTranslation();
  const [fileSystemPaths, fileSystemPathsSetter] = useState([]);
  useEffect(() => {
    // eslint-disable-next-line promise/catch-or-return
    getSubWikiPluginContent(mainWikiToLink).then(fileSystemPathsSetter);
  }, [mainWikiToLink]);

  return (
    <div className={classes.root}>
      <div className={classes.flexGrow}>
        <TextField
          id="outlined-full-width"
          label={t('EditWorkspace.Path')}
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
          onChange={e => onUpdateForm({ name: e.target.value })}
        />
        {!isSubWiki && (
          <TextField
            id="outlined-full-width"
            label={t('EditWorkspace.Port')}
            helperText={`${t('EditWorkspace.URL')}: ${homeUrl}`}
            error={Boolean(homeUrlError)}
            placeholder="Optional"
            fullWidth
            margin="dense"
            variant="outlined"
            className={classes.textField}
            InputLabelProps={{
              shrink: true,
            }}
            value={port}
            onChange={event =>
              onUpdateForm({ port: event.target.value, homeUrl: `http://localhost:${event.target.value}/` })
            }
          />
        )}
        <Autocomplete
          freeSolo
          options={fileSystemPaths.map(fileSystemPath => fileSystemPath.tagName)}
          value={tagName}
          onInputChange={(_, value) => onUpdateForm({ tagName: value })}
          renderInput={parameters => (
            <TextField
              {...parameters}
              fullWidth
              margin="dense"
              variant="outlined"
              className={classes.textField}
              label={t('AddWorkspace.TagName')}
              helperText={t('AddWorkspace.TagNameHelp')}
            />
          )}
        />
        <div className={classes.avatarFlex}>
          <div className={classes.avatarLeft}>
            <div className={classNames(classes.avatar, transparentBackground && classes.transparentAvatar)}>
              <img alt="Icon" className={classes.avatarPicture} src={getValidIconPath(picturePath, internetIcon)} />
            </div>
          </div>
          <div className={classes.avatarRight}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => {
                const options = {
                  properties: ['openFile'],
                  filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'tiff', 'tif', 'bmp', 'dib'] }],
                };
                window.remote.dialog.showOpenDialog(options).then(({ canceled, filePaths }) => {
                  if (!canceled && filePaths.length > 0) {
                    onUpdateForm({ picturePath: filePaths[0] });
                  }
                });
              }}
            >
              {t('EditWorkspace.SelectLocal')}
            </Button>
            <Typography variant="caption" className={classes.caption}>
              PNG, JPEG, GIF, TIFF or BMP.
            </Typography>
            {/* <Button
              variant="outlined"
              size="small"
              className={classes.buttonBot}
              disabled={!homeUrl || homeUrlError || downloadingIcon}
              onClick={() => onGetIconFromInternet(true)}
            >
              {downloadingIcon ? 'Downloading Icon...' : 'Download Icon from the Internet'}
            </Button> */}
            <Button
              variant="outlined"
              size="small"
              className={classes.buttonBot}
              onClick={() => onUpdateForm({ picturePath: null, internetIcon: null })}
              disabled={!(picturePath || internetIcon)}
            >
              {t('EditWorkspace.ResetDefaultIcon')}
            </Button>
            {/* <FormGroup>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={transparentBackground}
                    onChange={e => onUpdateForm({ transparentBackground: e.target.checked })}
                  />
                }
                label="Use transparent background"
              />
            </FormGroup> */}
          </div>
        </div>
        {!isSubWiki && (
          <List>
            <Divider />
            <ListItem disableGutters>
              <ListItemText primary={t('EditWorkspace.HibernateTitle')} secondary={t('EditWorkspace.Hibernate')} />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  color="primary"
                  checked={hibernateWhenUnused}
                  onChange={e => onUpdateForm({ hibernateWhenUnused: e.target.checked })}
                />
              </ListItemSecondaryAction>
            </ListItem>
            <ListItem disableGutters>
              <ListItemText
                primary={t('EditWorkspace.DisableNotificationTitle')}
                secondary={t('EditWorkspace.DisableNotification')}
              />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  color="primary"
                  checked={disableNotifications}
                  onChange={e => onUpdateForm({ disableNotifications: e.target.checked })}
                />
              </ListItemSecondaryAction>
            </ListItem>
            <ListItem disableGutters>
              <ListItemText
                primary={t('EditWorkspace.DisableAudioTitle')}
                secondary={t('EditWorkspace.DisableAudio')}
              />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  color="primary"
                  checked={disableAudio}
                  onChange={e => onUpdateForm({ disableAudio: e.target.checked })}
                />
              </ListItemSecondaryAction>
            </ListItem>
          </List>
        )}
      </div>
      <div>
        <Button color="primary" variant="contained" disableElevation className={classes.button} onClick={onSave}>
          {t('EditWorkspace.Save')}
        </Button>
        <Button
          variant="contained"
          disableElevation
          className={classes.button}
          onClick={() => window.remote.closeCurrentWindow()}
        >
          {t('EditWorkspace.Cancel')}
        </Button>
      </div>
    </div>
  );
};

EditWorkspace.defaultProps = {
  homeUrlError: null,
  internetIcon: null,
  nameError: null,
  picturePath: null,
};

EditWorkspace.propTypes = {
  classes: PropTypes.object.isRequired,
  mainWikiToLink: PropTypes.string,
  tagName: PropTypes.string,
  disableAudio: PropTypes.bool.isRequired,
  disableNotifications: PropTypes.bool.isRequired,
  downloadingIcon: PropTypes.bool.isRequired,
  hibernateWhenUnused: PropTypes.bool.isRequired,
  homeUrl: PropTypes.string.isRequired,
  port: PropTypes.string.isRequired,
  homeUrlError: PropTypes.string,
  internetIcon: PropTypes.string,
  isMailApp: PropTypes.bool.isRequired,
  name: PropTypes.string.isRequired,
  nameError: PropTypes.string,
  onSave: PropTypes.func.isRequired,
  onUpdateForm: PropTypes.func.isRequired,
  picturePath: PropTypes.string,
  transparentBackground: PropTypes.bool.isRequired,
  isSubWiki: PropTypes.bool,
};

const mapStateToProps = state => ({
  disableAudio: Boolean(state.dialogEditWorkspace.form.disableAudio),
  disableNotifications: Boolean(state.dialogEditWorkspace.form.disableNotifications),
  downloadingIcon: state.dialogEditWorkspace.downloadingIcon,
  hibernateWhenUnused: Boolean(state.dialogEditWorkspace.form.hibernateWhenUnused),
  homeUrl: state.dialogEditWorkspace.form.homeUrl || '',
  port: state.dialogEditWorkspace.form.port || '5212',
  homeUrlError: state.dialogEditWorkspace.form.homeUrlError,
  mainWikiToLink: state.dialogEditWorkspace.form.mainWikiToLink,
  tagName: state.dialogEditWorkspace.form.tagName,
  id: state.dialogEditWorkspace.form.id || '',
  internetIcon: state.dialogEditWorkspace.form.internetIcon,
  isMailApp: Boolean(getMailtoUrl(state.dialogEditWorkspace.form.homeUrl)),
  name: state.dialogEditWorkspace.form.name || '',
  nameError: state.dialogEditWorkspace.form.nameError,
  picturePath: state.dialogEditWorkspace.form.picturePath,
  transparentBackground: Boolean(state.dialogEditWorkspace.form.transparentBackground),
  isSubWiki: state.workspaces?.[state.dialogEditWorkspace.form.id]?.isSubWiki || true,
});

const actionCreators = {
  updateForm,
  save,
};

export default connectComponent(EditWorkspace, mapStateToProps, actionCreators, styles);
