import React from 'react';
import PropTypes from 'prop-types';

import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import ListSubheader from '@material-ui/core/ListSubheader';
import Divider from '@material-ui/core/Divider';
import Typography from '@material-ui/core/Typography';

import connectComponent from '../../helpers/connect-component';

const styles = (theme) => ({
  root: {
    height: '100vh',
    width: '100vw',
    paddingTop: theme.spacing.unit * 2,
    paddingBottom: theme.spacing.unit * 2,
    paddingLeft: 0,
    paddingRight: 0,
  },
  text: {
    paddingLeft: theme.spacing.unit * 2,
    paddingRight: theme.spacing.unit * 2,
  },
});

class DisplayMedia extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      sources: [],
    };
  }

  componentDidMount() {
    const { desktopCapturer } = window.require('electron');
    desktopCapturer.getSources({ types: ['window', 'screen'] })
      .then((sources) => {
        this.setState({ sources });
      });
  }

  render() {
    const { sources } = this.state;
    const { classes } = this.props;

    const screenSources = sources.filter((source) => source.id.startsWith('screen'));
    const windowSources = sources.filter((source) => source.id.startsWith('window'));
    // remove first item as it is the display media window itself
    windowSources.shift();

    return (
      <div className={classes.root}>
        <Typography variant="body1" className={classes.text}>
          The app wants to use the contents of your screen. Choose what you’d like to share.
        </Typography>
        <List>
          {screenSources.map((source) => (
            <ListItem
              button
              onClick={() => {
                const { ipcRenderer } = window.require('electron');
                ipcRenderer.send('display-media-selected', source.id);
              }}
            >
              <ListItemText primary={source.name} />
            </ListItem>
          ))}
          <Divider />
          <ListSubheader disableSticky>Windows</ListSubheader>
          {windowSources.map((source) => (
            <ListItem
              button
              onClick={() => {
                const { ipcRenderer } = window.require('electron');
                ipcRenderer.send('display-media-selected', source.id);
              }}
            >
              <ListItemText primary={source.name} />
            </ListItem>
          ))}
        </List>
      </div>
    );
  }
}

DisplayMedia.propTypes = {
  classes: PropTypes.object.isRequired,
};

export default connectComponent(
  DisplayMedia,
  null,
  null,
  styles,
);
