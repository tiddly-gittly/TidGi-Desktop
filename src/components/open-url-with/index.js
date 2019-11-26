import React from 'react';
import PropTypes from 'prop-types';

import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';

import ChevronRightIcon from '@material-ui/icons/ChevronRight';

import connectComponent from '../../helpers/connect-component';
import getWorkspacesAsList from '../../helpers/get-workspaces-as-list';
import getMailtoUrl from '../../helpers/get-mailto-url';

import { requestLoadURL } from '../../senders';

const { remote } = window.require('electron');

const OpenUrlWith = ({ workspaces }) => {
  const incomingUrl = remote.getGlobal('incomingUrl');
  const isMailtoUrl = incomingUrl.startsWith('mailto:');

  const renderWorkspace = (workspace, i) => {
    if (isMailtoUrl && !getMailtoUrl(workspace.homeUrl)) return null;
    return (
      <ListItem
        button
        onClick={() => {
          const u = isMailtoUrl ? getMailtoUrl(workspace.homeUrl).replace('%s', incomingUrl) : incomingUrl;

          requestLoadURL(u, workspace.id);
          remote.getCurrentWindow().close();
        }}
      >
        <ListItemText
          primary={workspace.name || `Workspace ${i + 1}`}
          secondary={`#${i + 1}`}
        />
        <ChevronRightIcon color="action" />
      </ListItem>
    );
  };

  return (
    <List dense>
      {getWorkspacesAsList(workspaces).map(renderWorkspace)}
    </List>
  );
};

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
