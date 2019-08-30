import React from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';

import connectComponent from '../../helpers/connect-component';

const titleBarHeight = 22;

const { remote } = window.require('electron');

const styles = (theme) => ({
  root: {
    background: 'radial-gradient(7px at 14px 50%, #ff5e57 0px, #ff635a 5px, #fd5249 6px, rgba(255, 255, 255, 0) 7px), radial-gradient(7px at 34px 50%, #ffbd2e 0px, #ffc42f 5px, #fcb91b 6px, rgba(255, 255, 255, 0) 7px), radial-gradient(7px at 54px 50%, #cfcfcf 0px, #d3d3d3 5px, #c6c6c6 6px, rgba(255, 255, 255, 0) 7px), linear-gradient(to top, #cccccc 0%, #d6d6d6 1px, #ebebeb 100%);',
    height: titleBarHeight,
    WebkitAppRegion: 'drag',
    WebkitUserSelect: 'none',
    textAlign: 'center',
    lineHeight: '22px',
    fontSize: '13px',
    color: 'rgb(77, 77, 77)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif',
  },
  rootDark: {
    background: theme.palette.background.default,
    color: '#fff',
  },
});

const FakeTitleBar = (props) => {
  const {
    classes,
    theme,
  } = props;

  if (window.process.platform !== 'darwin') return null;

  return (
    <div
      className={classnames(classes.root, theme === 'dark' && classes.rootDark)}
    >
      {remote.getCurrentWindow().getTitle()}
    </div>
  );
};

FakeTitleBar.propTypes = {
  classes: PropTypes.object.isRequired,
  theme: PropTypes.string.isRequired,
};

const mapStateToProps = (state) => ({
  theme: state.preferences.theme,
});

export default connectComponent(
  FakeTitleBar,
  mapStateToProps,
  null,
  styles,
);
