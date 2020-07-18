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
import { basename, dirname } from 'path';

import * as actions from '../../state/dialog-add-workspace/actions';

import type { IUserInfo } from './user-info';
import { requestCreateSubWiki, getIconPath, ensureWikiExist } from '../../senders';
import useWikiCreationMessage from './use-wiki-creation-message';

const CloseButton = styled(Button)`
  white-space: nowrap;
  width: 100%;
`;

interface Props {
  isCreateMainWorkspace: boolean;
  wikiPort: number;
  mainWikiToLink: { name: string, port: number };
  githubWikiUrl: string;
  existedFolderLocation: string;
  userInfo: IUserInfo;
}
interface ActionProps {
  updateForm: Object => void;
  setWikiCreationMessage: string => void;
  save: () => void;
}
interface StateProps {
  wikiCreationMessage: string;
}

function DoneButton({
  isCreateMainWorkspace,
  wikiPort,
  mainWikiToLink,
  githubWikiUrl,
  existedFolderLocation,
  updateForm,
  setWikiCreationMessage,
  wikiCreationMessage,
  save,
  userInfo,
}: Props & ActionProps & StateProps) {
  const port = isCreateMainWorkspace ? wikiPort : mainWikiToLink.port;
  const workspaceFormData = {
    name: existedFolderLocation,
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
          disabled={!existedFolderLocation || !githubWikiUrl || progressBarOpen}
          onClick={async () => {
            updateForm(workspaceFormData);
            const creationError = await ensureWikiExist(existedFolderLocation, true);
            if (creationError) {
              setWikiCreationMessage(creationError);
            } else {
              save();
            }
          }}
        >
          {existedFolderLocation && (
            <>
              <Typography variant="body1" display="inline">
                打开位于
              </Typography>
              <Typography
                variant="body2"
                noWrap
                display="inline"
                align="center"
                style={{ direction: 'rtl', textTransform: 'none' }}
              >
                {existedFolderLocation}
              </Typography>
            </>
          )}
          <Typography variant="body1" display="inline">
            的WIKI
          </Typography>
        </CloseButton>
      ) : (
        <CloseButton
          variant="contained"
          color="secondary"
          disabled={!existedFolderLocation || !mainWikiToLink.name || !githubWikiUrl || progressBarOpen}
          onClick={async () => {
            const wikiFolderName = basename(existedFolderLocation);
            const parentFolderLocation = dirname(existedFolderLocation);
            updateForm(workspaceFormData);
            let creationError = await ensureWikiExist(existedFolderLocation, false);
            if (!creationError) {
              creationError = await requestCreateSubWiki(parentFolderLocation, wikiFolderName, mainWikiToLink.name, true);
            }
            if (creationError) {
              setWikiCreationMessage(creationError);
            } else {
              save();
            }
          }}
        >
          {existedFolderLocation && (
            <>
              <Typography variant="body1" display="inline">
                打开位于
              </Typography>
              <Typography
                variant="body2"
                noWrap
                display="inline"
                align="center"
                style={{ direction: 'rtl', textTransform: 'none' }}
              >
                {existedFolderLocation}
              </Typography>
            </>
          )}
          <Typography variant="body1" display="inline">
            的WIKI
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

export default connect(mapStateToProps, dispatch => bindActionCreators(actions, dispatch))(DoneButton);
