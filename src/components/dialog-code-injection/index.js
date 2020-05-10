import React from 'react';
import PropTypes from 'prop-types';

import Button from '@material-ui/core/Button';

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
  },
  button: {
    float: 'right',
    marginLeft: theme.spacing(1),
  },
});

const getMode = () => {
  const codeInjectionType = window.require('electron').remote.getGlobal('codeInjectionType');
  if (codeInjectionType === 'css') return 'css';
  if (codeInjectionType === 'js') return 'javascript';
  return '';
};

const CodeInjection = ({
  classes,
  code,
  onSave,
  onUpdateForm,
  shouldUseDarkColors,
}) => (
  <div className={classes.root}>
    <div className={classes.flexGrow}>
      <AceEditor
        mode={getMode()}
        theme={shouldUseDarkColors ? 'monokai' : 'github'}
        height="100%"
        width="100%"
        name="codeEditor"
        value={code}
        onChange={(value) => onUpdateForm({ code: value })}
      />
    </div>
    <div className={classes.actions}>
      <Button color="primary" variant="contained" disableElevation className={classes.button} onClick={onSave}>
        Save
      </Button>
      <Button variant="contained" disableElevation className={classes.button} onClick={() => window.require('electron').remote.getCurrentWindow().close()}>
        Cancel
      </Button>
    </div>
  </div>
);

CodeInjection.propTypes = {
  classes: PropTypes.object.isRequired,
  code: PropTypes.string.isRequired,
  onSave: PropTypes.func.isRequired,
  onUpdateForm: PropTypes.func.isRequired,
  shouldUseDarkColors: PropTypes.bool.isRequired,
};

const mapStateToProps = (state) => ({
  code: state.dialogCodeInjection.form.code || '',
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
