import React from 'react';
import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';
import Divider from '@material-ui/core/Divider';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Radio from '@material-ui/core/Radio';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import connectComponent from '../../helpers/connect-component';
import { updateForm, save } from '../../state/dialog-proxy/actions';

const styles = (theme: any) => ({
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
    marginTop: theme.spacing(2),
  },
  link: {
    cursor: 'pointer',
    fontWeight: 500,
    outline: 'none',
    '&:hover': {
      textDecoration: 'underline',
    },
  },
  button: {
    float: 'right',
    marginLeft: theme.spacing(1),
  },
  radioLabel: theme.typography.body2,
});
interface OwnDialogProxyProps {
  classes: any;
  onSave: (...arguments_: any[]) => any;
  onUpdateForm: (...arguments_: any[]) => any;
  proxyBypassRules?: string;
  proxyPacScript?: string;
  proxyPacScriptError?: string;
  proxyRules?: string;
  proxyRulesError?: string;
  proxyType?: string;
}
type DialogProxyProps = OwnDialogProxyProps & typeof DialogProxy.defaultProps;
const DialogProxy = (props: DialogProxyProps) => {
  const { classes, onUpdateForm, onSave, proxyBypassRules, proxyPacScript, proxyPacScriptError, proxyRules, proxyRulesError, proxyType } = props;
  return (
    <div className={classes.root}>
      <div className={classes.flexGrow}>
        <List disablePadding dense>
          <ListItem>
            <div style={{ width: '100%' }}>
              <ListItemText primary="" />
              <FormControlLabel
                classes={{ label: classes.radioLabel }}
                control={<Radio color="primary" size="small" />}
                label="Use proxy server"
                labelPlacement="end"
                checked={proxyType === 'rules'}
                value="rules"
                onChange={(e) => onUpdateForm({ proxyType: (e.target as any).value })}
              />
              <TextField
                margin="dense"
                fullWidth
                label="Proxy address"
                variant="outlined"
                disabled={proxyType !== 'rules'}
                value={proxyRules}
                onChange={(e) => onUpdateForm({ proxyRules: e.target.value })}
                error={Boolean(proxyRulesError)}
                helperText={
                  proxyRulesError || (
                    <>
                      <span>Example: socks5://bar.com. </span>
                      <span
                        role="link"
                        tabIndex={0}
                        className={classes.link}
                        onClick={async () => await window.service.native.open('https://www.npmjs.com/package/proxy-agent')}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return;
                          {
                            return;
                          }
                          void window.service.native.open('https://www.npmjs.com/package/proxy-agent');
                        }}>
                        Learn more
                      </span>void window.service.native.open
                    </>
                  )
                }
              />
              <TextField
                margin="dense"
                fullWidth
                label="Bypass rules"
                variant="outlined"
                disabled={proxyType !== 'rules'}
                value={proxyBypassRules}
                onChange={(e) => onUpdateForm({ proxyBypassRules: e.target.value })}
                helperText={
                  <>
                    <span>Rules indicating which URLs should bypass the proxy settings. </span>
                    <span>Set to </span>
                    <strong>&lt;local&gt;</strong>
                    <span> to bypass proxy server for local addresses. </span>
                    <span
                      role="link"
                      tabIndex={0}
                      className={classes.link}
                      onClick={async () => await window.service.native.open('https://www.electronjs.org/docs/api/session#sessetproxyconfig')}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        {
                          return;
                        }
                        void window.service.native.open('https://www.electronjs.org/docs/api/session#sessetproxyconfig');
                      }}>
                      Learn more
                    </span>
                  </>
                }
              />
            </div>
          </ListItem>
          <Divider />
          <ListItem>
            <div style={{ width: '100%' }}>
              <ListItemText primary="" />
              <FormControlLabel
                classes={{ label: classes.radioLabel }}
                control={<Radio color="primary" size="small" />}
                label="Use automatic proxy configuration script (PAC)"
                labelPlacement="end"
                checked={proxyType === 'pacScript'}
                value="pacScript"
                onChange={(e) => onUpdateForm({ proxyType: (e.target as any).value })}
              />
              <TextField
                margin="dense"
                fullWidth
                label="Script URL"
                variant="outlined"
                disabled={proxyType !== 'pacScript'}
                value={proxyPacScript}
                onChange={(e) => onUpdateForm({ proxyPacScript: e.target.value })}
                error={Boolean(proxyPacScriptError)}
                helperText={
                  proxyPacScriptError || (
                    <>
                      <span>Example: http://example.com/proxy.pac. </span>
                      <span
                        role="link"
                        tabIndex={0}
                        className={classes.link}
                        onClick={async () => await window.service.native.open('https://en.wikipedia.org/wiki/Proxy_auto-config')}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return;
                          {
                            return;
                          }
                          void window.service.native.open('https://en.wikipedia.org/wiki/Proxy_auto-config');
                        }}>
                        Learn more
                      </span>
                    </>
                  )
                }
              />
              <TextField
                margin="dense"
                fullWidth
                label="Bypass rules"
                variant="outlined"
                disabled={proxyType !== 'pacScript'}
                onChange={(e) => onUpdateForm({ proxyBypassRules: e.target.value })}
                value={proxyBypassRules}
                helperText={
                  <>
                    <span>Rules indicating which URLs should bypass the proxy settings. </span>
                    <span>Set to </span>
                    <strong>&lt;local&gt;</strong>
                    <span> to bypass proxy server for local addresses. </span>
                    <span
                      role="link"
                      tabIndex={0}
                      className={classes.link}
                      onClick={async () => await window.service.native.open('https://www.electronjs.org/docs/api/session#sessetproxyconfig')}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        {
                          return;
                        }
                        void window.service.native.open('https://www.electronjs.org/docs/api/session#sessetproxyconfig');
                      }}>
                      Learn more
                    </span>
                  </>
                }
              />
            </div>
          </ListItem>
          <Divider />
          <ListItem>
            <div style={{ width: '100%' }}>
              <ListItemText primary="" />
              <FormControlLabel
                classes={{ label: classes.radioLabel }}
                control={<Radio color="primary" size="small" />}
                label="Do not use proxy (default)"
                labelPlacement="end"
                checked={proxyType !== 'rules' && proxyType !== 'pacScript'}
                value="none"
                onChange={(e) => onUpdateForm({ proxyType: (e.target as any).value })}
              />
            </div>
          </ListItem>
        </List>
      </div>
      <div className={classes.dialogActions}>
        <Button color="primary" variant="contained" disableElevation className={classes.button} onClick={onSave}>
          Save
        </Button>
        <Button variant="contained" disableElevation className={classes.button} onClick={() => window.remote.closeCurrentWindow()}>
          Cancel
        </Button>
      </div>
    </div>
  );
};
DialogProxy.defaultProps = {
  proxyBypassRules: '',
  proxyPacScript: '',
  proxyPacScriptError: null,
  proxyRules: '',
  proxyRulesError: null,
  proxyType: 'none',
};
const mapStateToProps = (state: any) => {
  const {
    form: { proxyBypassRules, proxyPacScript, proxyPacScriptError, proxyRules, proxyRulesError, proxyType },
  } = state.dialogProxy;
  return {
    proxyBypassRules,
    proxyPacScript,
    proxyPacScriptError,
    proxyRules,
    proxyRulesError,
    proxyType,
  };
};
const actionCreators = {
  updateForm,
  save,
};
export default connectComponent(DialogProxy, mapStateToProps, actionCreators, styles);
