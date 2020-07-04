// @flow
import React from 'react';
import styled from 'styled-components';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import Typography from '@material-ui/core/Typography';
import Button from '@material-ui/core/Button';

import * as actions from '../../state/dialog-add-workspace/actions';

import type { IUserInfo } from './user-info';
import { requestCopyWikiTemplate, requestCreateSubWiki, getIconPath, initWikiGit } from '../../senders';

const CloseButton = styled(Button)`
  white-space: nowrap;
  width: 100%;
  position: absolute;
  bottom: 0;
`;

interface Props {
  isCreateMainWorkspace: boolean;
  wikiPort: number;
  mainWikiToLink: string;
  githubWikiUrl: string;
  wikiFolderName: string;
  parentFolderLocation: string;
  userInfo: IUserInfo;
}
interface ActionProps {
  updateForm: Object => void;
  setWikiCreationMessage: string => void;
  save: () => void;
}

function DoneButton({
  isCreateMainWorkspace,
  wikiPort,
  mainWikiToLink,
  githubWikiUrl,
  wikiFolderName,
  parentFolderLocation,
  updateForm,
  setWikiCreationMessage,
  save,
  userInfo,
}: Props & ActionProps) {
  const wikiFolderLocation = `${parentFolderLocation}/${wikiFolderName}`;

  const workspaceFormData = {
    name: wikiFolderLocation,
    isSubWiki: !isCreateMainWorkspace,
    port: wikiPort,
    homeUrl: `http://localhost:${wikiPort}/`,
    gitUrl: githubWikiUrl, // don't need .git suffix
    picturePath: getIconPath(),
    userInfo,
  };
  return isCreateMainWorkspace ? (
    <CloseButton
      variant="contained"
      color="secondary"
      disabled={!parentFolderLocation}
      onClick={async () => {
        updateForm(workspaceFormData);
        let creationError = await requestCopyWikiTemplate(parentFolderLocation, wikiFolderName);
        if (!creationError) {
          console.log(githubWikiUrl)
          creationError = await initWikiGit(wikiFolderLocation, githubWikiUrl, userInfo);
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
      disabled={!parentFolderLocation || !mainWikiToLink}
      onClick={async () => {
        updateForm(workspaceFormData);
        let creationError = await requestCreateSubWiki(parentFolderLocation, wikiFolderName, mainWikiToLink);
        if (!creationError) {
          creationError = await initWikiGit(wikiFolderLocation, githubWikiUrl, userInfo);
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
  );
}

const mapStateToProps = state => ({
  wikiCreationMessage: state.dialogAddWorkspace.wikiCreationMessage,
});

export default connect(mapStateToProps, dispatch => bindActionCreators(actions, dispatch))(DoneButton);
