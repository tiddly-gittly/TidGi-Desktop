// External Dependencies
import { bindActionCreators } from 'redux';
import { connect } from 'react-redux';
import { withStyles } from '@material-ui/core/styles';

const connectComponent = (component: any, mapStateToProps: any, actionCreators: any, styles: any) => {
  // Adds `on` to binded action names
  const onActionCreators = {};
  if (actionCreators) {
    Object.keys(actionCreators).forEach((key) => {
      const newKey = `on${key[0].toUpperCase()}${key.substring(1, key.length)}`;
      // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      onActionCreators[newKey] = actionCreators[key];
    });
  }

  // @ts-expect-error ts-migrate(2554) FIXME: Expected 1 arguments, but got 2.
  const styledComponent = styles ? withStyles(styles)(component, { name: component.name }) : component;

  return connect(mapStateToProps, (dispatch) => bindActionCreators(onActionCreators, dispatch))(styledComponent);
};

export default connectComponent;
