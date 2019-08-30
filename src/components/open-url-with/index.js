import React from 'react';
import PropTypes from 'prop-types';

import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';

import ChevronRightIcon from '@material-ui/icons/ChevronRight';

import connectComponent from '../../helpers/connect-component';
import getWorkspacesAsList from '../../helpers/get-workspaces-as-list';

import { requestLoadURL } from '../../senders';

const { remote } = window.require('electron');

const OpenUrlWith = ({ workspaces }) => (
  <List dense>
    {getWorkspacesAsList(workspaces).map((workspace) => workspace.mailtoHandler && (
      <ListItem
        button
        onClick={() => {
          const incomingUrl = remote.getGlobal('incomingUrl');

          const u = incomingUrl.startsWith('mailto:') ? workspace.mailtoHandler.replace('%s', incomingUrl) : incomingUrl;

          requestLoadURL(u, workspace.id);
          remote.getCurrentWindow().close();
        }}
      >
        <ListItemText
          primary={workspace.name || `Workspace ${workspace.order + 1}`}
          secondary={`#${workspace.order + 1}`}
        />
        <ChevronRightIcon color="action" />
      </ListItem>
    ))}
  </List>
);

OpenUrlWith.propTypes = {
  workspaces: PropTypes.object.isRequired,
};

const mapStateToProps = (state) => ({
  workspaces: state.workspaces,
});

export default connectComponent(
  OpenUrlWith,
  mapStateToProps,
  null,
  null,
);
