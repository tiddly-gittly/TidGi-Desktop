// @flow
import React from 'react';
import styled from 'styled-components';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import Typography from '@material-ui/core/Typography';
import Button from '@material-ui/core/Button';
import { basename, dirname } from 'path';

import * as actions from '../../state/dialog-add-workspace/actions';

import type { IUserInfo } from './user-info';
import { requestCreateSubWiki, getIconPath, initWikiGit } from '../../senders';

const CloseButton = styled(Button)`
  white-space: nowrap;
  width: 100%;
`;

interface Props {
  isCreateMainWorkspace: boolean;
  wikiPort: number;
  mainWikiToLink: string;
  githubWikiUrl: string;
  existedFolderLocation: string;
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
  existedFolderLocation,
  updateForm,
  setWikiCreationMessage,
  save,
  userInfo,
}: Props & ActionProps) {
  const workspaceFormData = {
    name: existedFolderLocation,
    isSubWiki: !isCreateMainWorkspace,
    mainWikiToLink,
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
      disabled={!existedFolderLocation}
      onClick={async () => {
        updateForm(workspaceFormData);
        save();
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
      disabled={!existedFolderLocation || !mainWikiToLink}
      onClick={async () => {
        const wikiFolderName = basename(existedFolderLocation);
        const parentFolderLocation = dirname(existedFolderLocation);
        updateForm(workspaceFormData);
        const creationError = await requestCreateSubWiki(parentFolderLocation, wikiFolderName, mainWikiToLink, true);
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
  );
}

const mapStateToProps = state => ({
  wikiCreationMessage: state.dialogAddWorkspace.wikiCreationMessage,
});

export default connect(mapStateToProps, dispatch => bindActionCreators(actions, dispatch))(DoneButton);
