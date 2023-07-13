/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import Menu from '@mui/material/Menu';
import React from 'react';

interface Props {
  buttonElement: React.ReactElement;
  children: React.ReactNode[];
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

  onClick = (event: React.MouseEvent): void => {
    this.setState({ open: true, anchorEl: event.currentTarget });
  };

  handleRequestClose = (): void => {
    this.setState({ open: false });
  };

  render(): JSX.Element {
    const { buttonElement, children, id } = this.props;
    const { anchorEl, open } = this.state;
    const { handleRequestClose, onClick } = this;
    return (
      <>
        {React.cloneElement(buttonElement, {
          'aria-owns': id,
          'aria-haspopup': true,
          onClick,
        })}
        <Menu id={id} anchorEl={anchorEl} open={open} onClose={handleRequestClose} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
          {React.Children.map(children, (child: React.ReactNode) => {
            if (child && typeof child === 'object' && 'props' in child) {
              return React.cloneElement(child, {
                onClick: () => {
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                  if (typeof child.props.onClick === 'function') {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                    child.props.onClick();
                  }
                  handleRequestClose();
                },
              });
            }
            // eslint-disable-next-line unicorn/no-array-method-this-argument, unicorn/no-null
            return null;
          })}
        </Menu>
      </>
    );
  }
}
