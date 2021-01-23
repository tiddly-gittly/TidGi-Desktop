import React from 'react';

import Button from '@material-ui/core/Button';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Switch from '@material-ui/core/Switch';

import AceEditor from 'react-ace';

import 'ace-builds/src-noconflict/mode-css';
import 'ace-builds/src-noconflict/mode-javascript';
import 'ace-builds/src-noconflict/theme-github';
import 'ace-builds/src-noconflict/theme-monokai';

import { WindowNames, WindowMeta } from '@services/windows/WindowProperties';

import connectComponent from '../../helpers/connect-component';

import { updateForm, save } from '../../state/dialog-code-injection/actions';

const styles = (theme: any) => ({
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

const getMode = (codeInjectionType: any) => {
  if (codeInjectionType === 'css') return 'css';
  if (codeInjectionType === 'js') return 'javascript';
  return '';
};

interface OwnCodeInjectionProps {
  allowNodeInJsCodeInjection?: boolean;
  classes: any;
  code: string;
  onSave: (...arguments_: any[]) => any;
  onUpdateForm: (...arguments_: any[]) => any;
  shouldUseDarkColors: boolean;
}

// @ts-expect-error ts-migrate(2456) FIXME: Type alias 'CodeInjectionProps' circularly referen... Remove this comment to see the full error message
type CodeInjectionProps = OwnCodeInjectionProps & typeof CodeInjection.defaultProps;

// @ts-expect-error ts-migrate(7022) FIXME: 'CodeInjection' implicitly has type 'any' because ... Remove this comment to see the full error message
const CodeInjection = ({ allowNodeInJsCodeInjection, classes, code, onSave, onUpdateForm, shouldUseDarkColors }: CodeInjectionProps) => {
  const { codeInjectionType } = window.meta as WindowMeta[WindowNames.codeInjection];
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
              control={
                <Switch checked={allowNodeInJsCodeInjection} onChange={(e) => onUpdateForm({ allowNodeInJsCodeInjection: e.target.checked })} color="primary" />
              }
              label="Allow access to Node.JS & Electron APIs"
            />
          )}
        </div>
        <div className={classes.actionsRight}>
          <Button color="primary" variant="contained" disableElevation className={classes.button} onClick={onSave}>
            Save
          </Button>
          <Button variant="contained" disableElevation className={classes.button} onClick={() => window.remote.closeCurrentWindow()}>
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

const mapStateToProps = (state: any) => ({
  code: state.dialogCodeInjection.form.code || '',
  allowNodeInJsCodeInjection: state.dialogCodeInjection.form.allowNodeInJsCodeInjection,
  shouldUseDarkColors: state.general.shouldUseDarkColors,
});

const actionCreators = {
  updateForm,
  save,
};

export default connectComponent(CodeInjection, mapStateToProps, actionCreators, styles);
