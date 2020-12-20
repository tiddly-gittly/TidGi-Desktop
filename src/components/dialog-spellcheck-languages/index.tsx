import React from 'react';

import Button from '@material-ui/core/Button';
import Checkbox from '@material-ui/core/Checkbox';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import ListItemText from '@material-ui/core/ListItemText';

import connectComponent from '../../helpers/connect-component';

import hunspellLanguagesMap from '../../constants/hunspell-languages';

import { addLanguage, removeLanguage, save } from '../../state/dialog-spellcheck-languages/actions';

const styles = (theme: any) => ({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
  },

  top: {
    flex: 1,
    overflow: 'auto',
  },

  bottom: {
    display: 'fixed',
    zIndex: 10,
    bottom: 0,
    left: 0,
    padding: theme.spacing(1),
  },

  button: {
    float: 'right',
    marginLeft: theme.spacing(1),
  },
});

interface OwnDialogSpellcheckLanguagesProps {
  classes: any;
  onAddLanguage: (...arguments_: any[]) => any;
  onRemoveLanguage: (...arguments_: any[]) => any;
  onSave: (...arguments_: any[]) => any;
  spellcheckLanguages: string[];
}

// @ts-expect-error ts-migrate(2456) FIXME: Type alias 'DialogSpellcheckLanguagesProps' circul... Remove this comment to see the full error message
type DialogSpellcheckLanguagesProps = OwnDialogSpellcheckLanguagesProps & typeof DialogSpellcheckLanguages.defaultProps;

// @ts-expect-error ts-migrate(7022) FIXME: 'DialogSpellcheckLanguages' implicitly has type 'a... Remove this comment to see the full error message
const DialogSpellcheckLanguages = (props: DialogSpellcheckLanguagesProps) => {
  const { classes, spellcheckLanguages, onSave, onAddLanguage, onRemoveLanguage } = props;

  return (
    // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className={classes.root}>
      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <List disablePadding dense className={classes.top}>
        {Object.keys(hunspellLanguagesMap).map((code) => (
          // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <ListItem
            dense
            key={code}
            button
            onClick={() => {
              if (spellcheckLanguages.includes(code)) {
                onRemoveLanguage(code);
              } else {
                onAddLanguage(code);
              }
            }}>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItemIcon>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Checkbox
                edge="start"
                checked={spellcheckLanguages.includes(code)}
                disabled={spellcheckLanguages.length < 2 && spellcheckLanguages.includes(code)}
              />
            </ListItemIcon>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItemText primary={hunspellLanguagesMap[code]} />
          </ListItem>
        ))}
      </List>
      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className={classes.bottom}>
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

DialogSpellcheckLanguages.defaultProps = {};

const mapStateToProps = (state: any) => ({
  spellcheckLanguages: state.dialogSpellcheckLanguages.form.spellcheckLanguages,
});

const actionCreators = {
  save,
  addLanguage,
  removeLanguage,
};

export default connectComponent(DialogSpellcheckLanguages, mapStateToProps, actionCreators, styles);
