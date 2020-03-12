import React from 'react';
import PropTypes from 'prop-types';

import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';

import connectComponent from '../../helpers/connect-component';

import { updateForm, go } from '../../state/go-to-url/actions';

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
  },
});

const GoToUrl = ({
  classes, url, urlError, onUpdateForm, onGo,
}) => (
  <div className={classes.root}>
    <div className={classes.flexGrow}>
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
            e.target.blur();
          }
        }}
      />
    </div>
    <div>
      <Button color="primary" variant="contained" className={classes.button} onClick={onGo}>
        Go
      </Button>
    </div>
  </div>
);

GoToUrl.defaultProps = {
  urlError: null,
};

GoToUrl.propTypes = {
  classes: PropTypes.object.isRequired,
  url: PropTypes.string.isRequired,
  urlError: PropTypes.string,
  onUpdateForm: PropTypes.func.isRequired,
  onGo: PropTypes.func.isRequired,
};

const mapStateToProps = (state) => ({
  url: state.goToUrl.form.url,
  urlError: state.goToUrl.form.urlError,
});

const actionCreators = {
  updateForm,
  go,
};

export default connectComponent(
  GoToUrl,
  mapStateToProps,
  actionCreators,
  styles,
);
