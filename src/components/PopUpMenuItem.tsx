/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import React from 'react';
import Menu from '@material-ui/core/Menu';

interface Props {
  buttonElement: React.ReactElement;
  id: string;
}
interface State {
  anchorEl?: Element;
  open: boolean;
}
export default class PopUpMenuItem extends React.Component<Props, State> {
  state = {
    anchorEl: undefined,
    open: false,
  };

  handleClick = (event: React.MouseEvent): void => {
    this.setState({ open: true, anchorEl: event.currentTarget });
  };

  handleRequestClose = (): void => {
    this.setState({ open: false });
  };

  render(): JSX.Element {
    const { buttonElement, children, id } = this.props;
    const { anchorEl, open } = this.state;
    return (
      <>
        {React.cloneElement(buttonElement, {
          'aria-owns': id,
          'aria-haspopup': true,
          onClick: this.handleClick,
        })}
        <Menu id={id} anchorEl={anchorEl} open={open} onClose={this.handleRequestClose} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
          {React.Children.map(
            children,
            (child) =>
              child &&
              typeof child === 'object' &&
              'props' in child &&
              React.cloneElement(child, {
                onClick: () => {
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                  if (typeof child.props.onClick === 'function') {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                    child.props.onClick();
                  }
                  this.handleRequestClose();
                },
              }),
          )}
        </Menu>
      </>
    );
  }
}
