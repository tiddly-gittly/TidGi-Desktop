// External Dependencies
import { bindActionCreators } from 'redux';
import { connect } from 'react-redux';
import { withStyles } from '@material-ui/core/styles';

const connectComponent = (component, mapStateToProps, actionCreators, styles) => {
  // Adds `on` to binded action names
  const onActionCreators = {};
  if (actionCreators) {
    Object.keys(actionCreators).forEach((key) => {
      const newKey = `on${key[0].toUpperCase()}${key.substring(1, key.length)}`;
      onActionCreators[newKey] = actionCreators[key];
    });
  }

  const styledComponent = styles
    ? withStyles(styles)(component, { name: component.name })
    : component;

  return connect(
    mapStateToProps,
    (dispatch) => bindActionCreators(onActionCreators, dispatch),
  )(styledComponent);
};

export default connectComponent;
