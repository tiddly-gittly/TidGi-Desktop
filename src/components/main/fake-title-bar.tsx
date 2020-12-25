import React from 'react';
import classnames from 'classnames';

import connectComponent from '../../helpers/connect-component';

const titleBarHeight = 22;

const styles = (theme: any) => ({
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

interface OwnFakeTitleBarProps {
  classes: any;
  title?: string;
}

// @ts-expect-error ts-migrate(2456) FIXME: Type alias 'FakeTitleBarProps' circularly referenc... Remove this comment to see the full error message
type FakeTitleBarProps = OwnFakeTitleBarProps & typeof FakeTitleBar.defaultProps;

// @ts-expect-error ts-migrate(7022) FIXME: 'FakeTitleBar' implicitly has type 'any' because i... Remove this comment to see the full error message
const FakeTitleBar = (props: FakeTitleBarProps) => {
  const { classes, title } = props;

  if (window.remote.getPlatform() !== 'darwin') return null;

  return (
    // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div
      className={classnames(classes.root, window.meta.windowName === 'menubar' && classes.rootMenubar)}
      onDoubleClick={() => {
        // feature: double click on title bar to expand #656
        // https://github.com/atomery/webcatalog/issues/656
        window.remote.toggleMaximize();
      }}>
      {(window.meta.windowName === 'main' || window.meta.windowName === 'menubar') && title ? title : window.remote.getAppName()}
    </div>
  );
};

FakeTitleBar.defaultProps = {
  title: '',
};

const mapStateToProps = (state: any) => ({
  title: state.general.title,
});

export default connectComponent(FakeTitleBar, mapStateToProps, null, styles);
