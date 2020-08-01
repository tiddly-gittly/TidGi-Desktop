// @flow
import React from 'react';
import styled from 'styled-components';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import Typography from '@material-ui/core/Typography';
import Button from '@material-ui/core/Button';
import LinearProgress from '@material-ui/core/LinearProgress';
import Snackbar from '@material-ui/core/Snackbar';
import Alert from '@material-ui/lab/Alert';

import * as actions from '../../state/dialog-add-workspace/actions';

import type { IUserInfo } from './user-info';
import { requestCopyWikiTemplate, requestCreateSubWiki, getIconPath, initWikiGit } from '../../senders';

import useWikiCreationMessage from './use-wiki-creation-message';

const CloseButton = styled(Button)`
  white-space: nowrap;
  width: 100%;
`;

type OwnProps = {|
  isCreateMainWorkspace: boolean,
  wikiPort: number,
  mainWikiToLink: { name: string, port: number },
  githubWikiUrl: string,
  wikiFolderName: string,
  parentFolderLocation: string,
  userInfo?: IUserInfo,
|};
type DispatchProps = {|
  updateForm: Object => void,
  setWikiCreationMessage: string => void,
  save: () => void,
|};

type StateProps = {|
  wikiCreationMessage: string,
|};

type Props = {
  ...OwnProps,
  ...DispatchProps,
  ...StateProps,
};

function NewWikiDoneButton({
  isCreateMainWorkspace,
  wikiPort,
  mainWikiToLink,
  githubWikiUrl,
  wikiFolderName,
  parentFolderLocation,
  updateForm,
  setWikiCreationMessage,
  wikiCreationMessage,
  save,
  userInfo,
}: Props) {
  const wikiFolderLocation = `${parentFolderLocation}/${wikiFolderName}`;

  const port = isCreateMainWorkspace ? wikiPort : mainWikiToLink.port;
  const workspaceFormData = {
    name: wikiFolderLocation,
    isSubWiki: !isCreateMainWorkspace,
    mainWikiToLink: mainWikiToLink.name,
    port,
    homeUrl: `http://localhost:${port}/`,
    gitUrl: githubWikiUrl, // don't need .git suffix
    picturePath: getIconPath(),
    userInfo,
  };

  const [snackBarOpen, progressBarOpen, snackBarOpenSetter] = useWikiCreationMessage(wikiCreationMessage);

  return (
    <>
      {progressBarOpen && <LinearProgress color="secondary" />}
      <Snackbar open={snackBarOpen} autoHideDuration={5000} onClose={() => snackBarOpenSetter(false)}>
        <Alert severity="info">{wikiCreationMessage}</Alert>
      </Snackbar>

      {isCreateMainWorkspace ? (
        <CloseButton
          variant="contained"
          color="secondary"
          disabled={!parentFolderLocation || !githubWikiUrl || progressBarOpen || !userInfo}
          onClick={async () => {
            updateForm(workspaceFormData);
            let creationError = await requestCopyWikiTemplate(parentFolderLocation, wikiFolderName);
            if (!creationError) {
              console.log(githubWikiUrl);
              creationError = await initWikiGit(wikiFolderLocation, githubWikiUrl, userInfo, true);
            }
            if (creationError) {
              setWikiCreationMessage(creationError);
            } else {
              save();
            }
          }}
        >
          {parentFolderLocation && (
            <>
              <Typography variant="body1" display="inline">
                在
              </Typography>
              <Typography
                variant="body2"
                noWrap
                display="inline"
                align="center"
                style={{ direction: 'rtl', textTransform: 'none' }}
              >
                {wikiFolderLocation}
              </Typography>
            </>
          )}
          <Typography variant="body1" display="inline">
            创建WIKI
          </Typography>
        </CloseButton>
      ) : (
        <CloseButton
          variant="contained"
          color="secondary"
          disabled={!parentFolderLocation || !mainWikiToLink.name || !githubWikiUrl || progressBarOpen || !userInfo}
          onClick={async () => {
            updateForm(workspaceFormData);
            let creationError = await requestCreateSubWiki(parentFolderLocation, wikiFolderName, mainWikiToLink.name);
            if (!creationError) {
              creationError = await initWikiGit(wikiFolderLocation, githubWikiUrl, userInfo, false);
            }
            if (creationError) {
              setWikiCreationMessage(creationError);
            } else {
              save();
            }
          }}
        >
          {parentFolderLocation && (
            <>
              <Typography variant="body1" display="inline">
                在
              </Typography>
              <Typography
                variant="body2"
                noWrap
                display="inline"
                align="center"
                style={{ direction: 'rtl', textTransform: 'none' }}
              >
                {wikiFolderLocation}
              </Typography>
            </>
          )}
          <Typography variant="body1" display="inline">
            创建WIKI
          </Typography>
          <Typography variant="body1" display="inline">
            并链接到主知识库
          </Typography>
        </CloseButton>
      )}
    </>
  );
}

const mapStateToProps = state => ({
  wikiCreationMessage: state.dialogAddWorkspace.wikiCreationMessage,
});

export default connect<Props, OwnProps, _, _, _, _>(mapStateToProps, dispatch => bindActionCreators(actions, dispatch))(
  NewWikiDoneButton,
);
