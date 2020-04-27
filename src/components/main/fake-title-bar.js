import React from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';

import connectComponent from '../../helpers/connect-component';

const titleBarHeight = 22;

const styles = (theme) => ({
  root: {
    background: theme.palette.type === 'dark' ? '#2a2b2c' : 'linear-gradient(top, #e4e4e4, #cecece)',
    height: titleBarHeight,
    WebkitAppRegion: 'drag',
    WebkitUserSelect: 'none',
    textAlign: 'center',
    lineHeight: '22px',
    fontSize: '13px',
    color: theme.palette.type === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgb(77, 77, 77)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif',
    fontWeight: 500,
    paddingLeft: 72,
    paddingRight: 72,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rootMenubar: {
    paddingLeft: theme.spacing(1),
    paddingRight: theme.spacing(1),
  },
});

const FakeTitleBar = (props) => {
  const {
    classes,
    title,
  } = props;

  if (window.process.platform !== 'darwin') return null;

  return (
    <div
      className={classnames(classes.root, window.mode === 'menubar' && classes.rootMenubar)}
      onDoubleClick={() => {
        // feature: double click on title bar to expand #656
        // https://github.com/atomery/webcatalog/issues/656
        const win = window.require('electron').remote.getCurrentWindow();
        if (win.isMaximized()) {
          win.unmaximize();
        } else {
          win.maximize();
        }
      }}
    >
      {(window.mode === 'main' || window.mode === 'menubar') && title ? title : window.require('electron').remote.getCurrentWindow().getTitle()}
    </div>
  );
};

FakeTitleBar.defaultProps = {
  title: '',
};

FakeTitleBar.propTypes = {
  classes: PropTypes.object.isRequired,
  title: PropTypes.string,
};

const mapStateToProps = (state) => ({
  title: state.general.title,
});

export default connectComponent(
  FakeTitleBar,
  mapStateToProps,
  null,
  styles,
);
