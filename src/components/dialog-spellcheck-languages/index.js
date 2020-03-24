import React from 'react';
import PropTypes from 'prop-types';

import Button from '@material-ui/core/Button';
import Checkbox from '@material-ui/core/Checkbox';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import ListItemText from '@material-ui/core/ListItemText';

import connectComponent from '../../helpers/connect-component';

import hunspellLanguagesMap from '../../constants/hunspell-languages';

import {
  addLanguage,
  removeLanguage,
  save,
} from '../../state/dialog-spellcheck-languages/actions';

const styles = (theme) => ({
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

const DialogSpellcheckLanguages = (props) => {
  const {
    classes,
    spellcheckLanguages,
    onSave,
    onAddLanguage,
    onRemoveLanguage,
  } = props;

  return (
    <div className={classes.root}>
      <List
        disablePadding
        dense
        className={classes.top}
      >
        {Object.keys(hunspellLanguagesMap).map((code) => (
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
            }}
          >
            <ListItemIcon>
              <Checkbox
                edge="start"
                checked={spellcheckLanguages.includes(code)}
                disabled={spellcheckLanguages.length < 2
                  && spellcheckLanguages.includes(code)}
              />
            </ListItemIcon>
            <ListItemText primary={hunspellLanguagesMap[code]} />
          </ListItem>
        ))}
      </List>
      <div className={classes.bottom}>
        <Button color="primary" variant="contained" disableElevation className={classes.button} onClick={onSave}>
          Save
        </Button>
        <Button variant="contained" disableElevation className={classes.button} onClick={() => window.require('electron').remote.getCurrentWindow().close()}>
          Cancel
        </Button>
      </div>
    </div>
  );
};

DialogSpellcheckLanguages.defaultProps = {};

DialogSpellcheckLanguages.propTypes = {
  classes: PropTypes.object.isRequired,
  onAddLanguage: PropTypes.func.isRequired,
  onRemoveLanguage: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  spellcheckLanguages: PropTypes.arrayOf(PropTypes.string).isRequired,
};

const mapStateToProps = (state) => ({
  spellcheckLanguages: state.dialogSpellcheckLanguages.form.spellcheckLanguages,
});

const actionCreators = {
  save,
  addLanguage,
  removeLanguage,
};

export default connectComponent(
  DialogSpellcheckLanguages,
  mapStateToProps,
  actionCreators,
  styles,
);
