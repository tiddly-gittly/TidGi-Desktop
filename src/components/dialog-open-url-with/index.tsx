import React from 'react';

import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';

import ChevronRightIcon from '@material-ui/icons/ChevronRight';

import connectComponent from '../../helpers/connect-component';
import getWorkspacesAsList from '../../helpers/get-workspaces-as-list';
import getMailtoUrl from '../../helpers/get-mailto-url';

import { requestLoadUrl } from '../../senders';

interface OpenUrlWithProps {
  workspaces: any;
}

const OpenUrlWith = ({ workspaces }: OpenUrlWithProps) => {
  const incomingUrl = window.remote.getGlobal('incomingUrl');
  const isMailtoUrl = incomingUrl.startsWith('mailto:');

  const renderWorkspace = (workspace: any, index: any) => {
    if (isMailtoUrl && !getMailtoUrl(workspace.homeUrl)) return null;
    return (
      <ListItem
        button
        onClick={() => {
          const u = isMailtoUrl ? getMailtoUrl(workspace.homeUrl).replace('%s', incomingUrl) : incomingUrl;

          requestLoadUrl(u, workspace.id);
          window.remote.closeCurrentWindow();
        }}>
        <ListItemText primary={workspace.name || `Workspace ${index + 1}`} secondary={`#${index + 1}`} />
        <ChevronRightIcon color="action" />
      </ListItem>
    );
  };

  return <List dense>{getWorkspacesAsList(workspaces).map(renderWorkspace)}</List>;
};

const mapStateToProps = (state: any) => ({
  workspaces: state.workspaces,
});

export default connectComponent(OpenUrlWith, mapStateToProps, null, null);
