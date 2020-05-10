import React from 'react';
import PropTypes from 'prop-types';

import Button from '@material-ui/core/Button';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Switch from '@material-ui/core/Switch';

import AceEditor from 'react-ace';

import 'ace-builds/src-noconflict/mode-css';
import 'ace-builds/src-noconflict/mode-javascript';
import 'ace-builds/src-noconflict/theme-github';
import 'ace-builds/src-noconflict/theme-monokai';

import connectComponent from '../../helpers/connect-component';

import { updateForm, save } from '../../state/dialog-code-injection/actions';

const styles = (theme) => ({
  root: {
    background: theme.palette.background.paper,
    height: '100vh',
    width: '100vw',
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  flexGrow: {
    flex: 1,
  },
  actions: {
    borderTop: `1px solid ${theme.palette.divider}`,
    padding: theme.spacing(2),
    display: 'flex',
  },
  actionsLeft: {
    flex: 1,
  },
  button: {
    float: 'right',
    marginLeft: theme.spacing(1),
  },
});

const getMode = (codeInjectionType) => {
  if (codeInjectionType === 'css') return 'css';
  if (codeInjectionType === 'js') return 'javascript';
  return '';
};

const CodeInjection = ({
  allowNodeInJsCodeInjection,
  classes,
  code,
  onSave,
  onUpdateForm,
  shouldUseDarkColors,
}) => {
  const codeInjectionType = window.require('electron').remote.getGlobal('codeInjectionType');
  return (
    <div className={classes.root}>
      <div className={classes.flexGrow}>
        <AceEditor
          mode={getMode(codeInjectionType)}
          theme={shouldUseDarkColors ? 'monokai' : 'github'}
          height="100%"
          width="100%"
          name="codeEditor"
          value={code}
          onChange={(value) => onUpdateForm({ code: value })}
        />
      </div>
      <div className={classes.actions}>
        <div className={classes.actionsLeft}>
          {codeInjectionType === 'js' && (
            <FormControlLabel
              control={(
                <Switch
                  checked={allowNodeInJsCodeInjection}
                  onChange={(e) => onUpdateForm({ allowNodeInJsCodeInjection: e.target.checked })}
                  color="primary"
                />
              )}
              label="Allow access to Node.JS & Electron APIs"
            />
          )}
        </div>
        <div className={classes.actionsRight}>
          <Button color="primary" variant="contained" disableElevation className={classes.button} onClick={onSave}>
            Save
          </Button>
          <Button variant="contained" disableElevation className={classes.button} onClick={() => window.require('electron').remote.getCurrentWindow().close()}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};

CodeInjection.defaultProps = {
  allowNodeInJsCodeInjection: false,
};

CodeInjection.propTypes = {
  allowNodeInJsCodeInjection: PropTypes.bool,
  classes: PropTypes.object.isRequired,
  code: PropTypes.string.isRequired,
  onSave: PropTypes.func.isRequired,
  onUpdateForm: PropTypes.func.isRequired,
  shouldUseDarkColors: PropTypes.bool.isRequired,
};

const mapStateToProps = (state) => ({
  code: state.dialogCodeInjection.form.code || '',
  allowNodeInJsCodeInjection: state.dialogCodeInjection.form.allowNodeInJsCodeInjection,
  shouldUseDarkColors: state.general.shouldUseDarkColors,
});

const actionCreators = {
  updateForm,
  save,
};

export default connectComponent(
  CodeInjection,
  mapStateToProps,
  actionCreators,
  styles,
);
