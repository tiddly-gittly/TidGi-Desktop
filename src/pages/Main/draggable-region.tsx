// this component is to fix
// -webkit-app-region: drag; not working when set to an element in BrowserView
// This is a workaround for the issue
// You can put the draggable divs at the same region in BrowserWindow,
// then even if you put a BrowserView on top of that region, that region is still draggable.

import React from 'react';
import classNames from 'classnames';

import connectComponent from '../../helpers/connect-component';

const styles = () => ({
  root: {
    height: 22,
    width: '100vw',
    WebkitAppRegion: 'drag',
    WebkitUserSelect: 'none',
    background: 'transparent',
    position: 'absolute',
    top: 0,
    left: 0,
  },
  // BrowserView has different position & width because of sidebar
  rootWithSidebar: {
    width: 'calc(100vw - 68px)', // sidebar width is 68px
    left: 68,
  },
});

interface DraggableRegionProps {
  classes: any;
  navigationBar: boolean;
  sidebar: boolean;
  titleBar: boolean;
}

const DraggableRegion = ({ classes, navigationBar, sidebar, titleBar }: DraggableRegionProps) => {
  // on macOS or menubar mode, if all bars are hidden
  // the top 22px part of BrowserView should be draggable
  if ((window.remote.getPlatform() === 'darwin' || window.meta.windowName === 'menubar') && !navigationBar && !titleBar) {
    return <div className={classNames(classes.root, sidebar && classes.rootWithSidebar)} />;
  }

  return null;
};

const mapStateToProps = (state: any) => ({
  navigationBar:
    (window.remote.getPlatform() === 'linux' && state.preferences.attachToMenubar && !state.preferences.sidebar) || state.preferences.navigationBar,

  sidebar: state.preferences.sidebar,
  titleBar: state.preferences.titleBar,
});

export default connectComponent(DraggableRegion, mapStateToProps, null, styles);
