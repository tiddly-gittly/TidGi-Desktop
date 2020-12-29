import React from 'react';
import Menu from '@material-ui/core/Menu';
interface Props {
  buttonElement: React.ReactElement;
  id: string;
}
type State = any;
class StatedMenu extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      anchorEl: undefined,
      open: false,
    };
    this.handleClick = this.handleClick.bind(this);
    this.handleRequestClose = this.handleRequestClose.bind(this);
  }

  handleClick(event: any) {
    this.setState({ open: true, anchorEl: event.currentTarget });
  }

  handleRequestClose() {
    this.setState({ open: false });
  }

  render() {
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
              // @ts-expect-error ts-migrate(2769) FIXME: No overload matches this call.
              React.cloneElement(child, {
                onClick: () => {
                  if ((child as any).props.onClick) {
                    (child as any).props.onClick();
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
export default StatedMenu;
