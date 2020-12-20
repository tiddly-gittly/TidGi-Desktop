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
import { requestOpen } from '../../senders';
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
// @ts-expect-error ts-migrate(2456) FIXME: Type alias 'DialogProxyProps' circularly reference... Remove this comment to see the full error message
type DialogProxyProps = OwnDialogProxyProps & typeof DialogProxy.defaultProps;
// @ts-expect-error ts-migrate(7022) FIXME: 'DialogProxy' implicitly has type 'any' because it... Remove this comment to see the full error message
const DialogProxy = (props: DialogProxyProps) => {
  const { classes, onUpdateForm, onSave, proxyBypassRules, proxyPacScript, proxyPacScriptError, proxyRules, proxyRulesError, proxyType } = props;
  return (
    // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className={classes.root}>
      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className={classes.flexGrow}>
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <List disablePadding dense>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <ListItem>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div style={{ width: '100%' }}>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText primary="" />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <FormControlLabel
                classes={{ label: classes.radioLabel }}
                // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                control={<Radio color="primary" size="small" />}
                label="Use proxy server"
                labelPlacement="end"
                checked={proxyType === 'rules'}
                value="rules"
                onChange={(e) => onUpdateForm({ proxyType: (e.target as any).value })}
              />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
                    // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <>
                      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <span>Example: socks5://bar.com. </span>
                      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <span
                        role="link"
                        tabIndex={0}
                        className={classes.link}
                        // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
                        onClick={() => requestOpen('https://www.npmjs.com/package/proxy-agent')}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return;
                          {
                            return;
                          }
                          // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
                          requestOpen('https://www.npmjs.com/package/proxy-agent');
                        }}>
                        Learn more
                      </span>
                    </>
                  )
                }
              />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <TextField
                margin="dense"
                fullWidth
                label="Bypass rules"
                variant="outlined"
                disabled={proxyType !== 'rules'}
                value={proxyBypassRules}
                onChange={(e) => onUpdateForm({ proxyBypassRules: e.target.value })}
                helperText={
                  // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  <>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span>Rules indicating which URLs should bypass the proxy settings. </span>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span>Set to </span>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <strong>&lt;local&gt;</strong>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span> to bypass proxy server for local addresses. </span>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span
                      role="link"
                      tabIndex={0}
                      className={classes.link}
                      // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
                      onClick={() => requestOpen('https://www.electronjs.org/docs/api/session#sessetproxyconfig')}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        {
                          return;
                        }
                        // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
                        requestOpen('https://www.electronjs.org/docs/api/session#sessetproxyconfig');
                      }}>
                      Learn more
                    </span>
                  </>
                }
              />
            </div>
          </ListItem>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Divider />
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <ListItem>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div style={{ width: '100%' }}>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText primary="" />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <FormControlLabel
                classes={{ label: classes.radioLabel }}
                // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                control={<Radio color="primary" size="small" />}
                label="Use automatic proxy configuration script (PAC)"
                labelPlacement="end"
                checked={proxyType === 'pacScript'}
                value="pacScript"
                onChange={(e) => onUpdateForm({ proxyType: (e.target as any).value })}
              />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
                    // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <>
                      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <span>Example: http://example.com/proxy.pac. </span>
                      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <span
                        role="link"
                        tabIndex={0}
                        className={classes.link}
                        // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
                        onClick={() => requestOpen('https://en.wikipedia.org/wiki/Proxy_auto-config')}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return;
                          {
                            return;
                          }
                          // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
                          requestOpen('https://en.wikipedia.org/wiki/Proxy_auto-config');
                        }}>
                        Learn more
                      </span>
                    </>
                  )
                }
              />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <TextField
                margin="dense"
                fullWidth
                label="Bypass rules"
                variant="outlined"
                disabled={proxyType !== 'pacScript'}
                onChange={(e) => onUpdateForm({ proxyBypassRules: e.target.value })}
                value={proxyBypassRules}
                helperText={
                  // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  <>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span>Rules indicating which URLs should bypass the proxy settings. </span>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span>Set to </span>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <strong>&lt;local&gt;</strong>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span> to bypass proxy server for local addresses. </span>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span
                      role="link"
                      tabIndex={0}
                      className={classes.link}
                      // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
                      onClick={() => requestOpen('https://www.electronjs.org/docs/api/session#sessetproxyconfig')}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        {
                          return;
                        }
                        // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
                        requestOpen('https://www.electronjs.org/docs/api/session#sessetproxyconfig');
                      }}>
                      Learn more
                    </span>
                  </>
                }
              />
            </div>
          </ListItem>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Divider />
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <ListItem>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div style={{ width: '100%' }}>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText primary="" />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <FormControlLabel
                classes={{ label: classes.radioLabel }}
                // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className={classes.dialogActions}>
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Button color="primary" variant="contained" disableElevation className={classes.button} onClick={onSave}>
          Save
        </Button>
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
