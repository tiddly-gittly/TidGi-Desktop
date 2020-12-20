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
      // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <ListItem
        button
        onClick={() => {
          const u = isMailtoUrl ? getMailtoUrl(workspace.homeUrl).replace('%s', incomingUrl) : incomingUrl;

          requestLoadUrl(u, workspace.id);
          window.remote.closeCurrentWindow();
        }}>
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <ListItemText primary={workspace.name || `Workspace ${index + 1}`} secondary={`#${index + 1}`} />
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <ChevronRightIcon color="action" />
      </ListItem>
    );
  };

  // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return <List dense>{getWorkspacesAsList(workspaces).map(renderWorkspace)}</List>;
};

const mapStateToProps = (state: any) => ({
  workspaces: state.workspaces,
});

export default connectComponent(OpenUrlWith, mapStateToProps, null, null);
