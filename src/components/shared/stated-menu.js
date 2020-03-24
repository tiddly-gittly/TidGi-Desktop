import React from 'react';
import PropTypes from 'prop-types';

import Menu from '@material-ui/core/Menu';

class StatedMenu extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      anchorEl: undefined,
      open: false,
    };

    this.handleClick = this.handleClick.bind(this);
    this.handleRequestClose = this.handleRequestClose.bind(this);
  }

  handleClick(event) {
    this.setState({ open: true, anchorEl: event.currentTarget });
  }

  handleRequestClose() {
    this.setState({ open: false });
  }

  render() {
    const {
      buttonElement,
      children,
      id,
      hasCheckbox,
    } = this.props;

    const { anchorEl, open } = this.state;

    return (
      <>
        {React.cloneElement(buttonElement, {
          'aria-owns': id,
          'aria-haspopup': true,
          onClick: this.handleClick,
        })}
        <Menu
          id={id}
          anchorEl={anchorEl}
          open={open}
          onClose={this.handleRequestClose}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
          disableAutoFocusItem={hasCheckbox}
        >
          {React.Children.map(children, (child) => child && React.cloneElement(child, {
            onClick: hasCheckbox ? null : () => {
              if (child.props.onClick) child.props.onClick();
              this.handleRequestClose();
            },
          }))}
        </Menu>
      </>
    );
  }
}

StatedMenu.defaultProps = {
  hasCheckbox: false,
};

StatedMenu.propTypes = {
  buttonElement: PropTypes.element.isRequired,
  children: PropTypes.node.isRequired,
  hasCheckbox: PropTypes.bool,
  id: PropTypes.string.isRequired,
};

export default StatedMenu;
