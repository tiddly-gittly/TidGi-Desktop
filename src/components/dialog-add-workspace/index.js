import React, { useState } from 'react';
import PropTypes from 'prop-types';
import styled from 'styled-components';
import is from 'styled-is';

import Paper from '@material-ui/core/Paper';
import Typography from '@material-ui/core/Typography';
import TextField from '@material-ui/core/TextField';
import Button from '@material-ui/core/Button';
import FolderIcon from '@material-ui/icons/Folder';
import GithubIcon from '@material-ui/icons/GitHub';

import connectComponent from '../../helpers/connect-component';
import { updateForm, save } from '../../state/dialog-add-workspace/actions';

import { requestCopyWikiTemplate, getIconPath } from '../../senders';

const Container = styled.main`
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;
const Description = styled(Paper)`
  padding: 10px;
`;
const CreateContainer = styled(Paper)`
  margin-top: 5px;
`;
const LocationPickerInput = styled(TextField)``;
const LocationPickerButton = styled(Button)`
  white-space: nowrap;
  width: 100%;
`;
const CreatorButton = styled(Button)`
  white-space: nowrap;
  width: 100%;
  ${is('disabled')`
    display: none;
  `}
  border-radius: 0;
`;
const SyncToGithubButton = styled(Button)`
  white-space: nowrap;
  width: 100%;
`;
const SyncContainer = styled(Paper)`
  margin-top: 5px;
`;
const CloseButton = styled(Button)`
  white-space: nowrap;
  width: 100%;
  position: absolute;
  bottom: 0;
`;

function AddWorkspace({ wikiCreationMessage, onUpdateForm, onSave }) {
  const [folderLocation, folderLocationSetter] = useState('');
  const messageHasError = wikiCreationMessage.startsWith('Error: ');
  const message = wikiCreationMessage.replace('Error: ', '');
  const succeed = !messageHasError && wikiCreationMessage.length > 0;
  return (
    <Container>
      <Description elevation={0} square>
        主知识库包含了TiddlyWiki的配置文件，以及发布为博客时的公开内容。
      </Description>

      <CreateContainer elevation={2} square>
        <Typography variant="subtitle1" align="center">
          创建主知识库
        </Typography>
        <LocationPickerButton
          onClick={() => {
            const { remote } = window.require('electron');
            remote.dialog
              .showOpenDialog(remote.getCurrentWindow(), {
                properties: ['openDirectory'],
              })
              .then(({ canceled, filePaths }) => {
                if (!canceled && filePaths.length > 0) {
                  folderLocationSetter(filePaths[0]);
                }
              });
          }}
          variant="contained"
          color={folderLocation ? 'default' : 'primary'}
          disableElevation
          endIcon={<FolderIcon />}
        >
          <Typography variant="button" display="inline">
            选择放置WIKI的父文件夹
          </Typography>
        </LocationPickerButton>
        <LocationPickerInput
          error={messageHasError}
          helperText={message}
          fullWidth
          onChange={(event) => folderLocationSetter(event.target.value)}
          label="知识库的父文件夹"
          value={folderLocation}
          disabled={succeed}
        />
        <CreatorButton
          variant="contained"
          color="primary"
          disabled={folderLocation.length === 0 || succeed}
          onClick={() => {
            requestCopyWikiTemplate(folderLocation);
            onUpdateForm({ name: folderLocation, homeUrl: 'http://localhost:5112', picturePath: getIconPath() });
          }}
        >
          创建知识库
        </CreatorButton>
      </CreateContainer>

      <SyncContainer elevation={2} square>
        <Typography variant="subtitle1" align="center">
          同步到云端
        </Typography>
        <SyncToGithubButton color="secondary" endIcon={<GithubIcon />}>
          登录Github账号
        </SyncToGithubButton>
      </SyncContainer>

      <CloseButton variant="contained" color="secondary" onClick={() => onSave()}>
        完成
      </CloseButton>
    </Container>
  );
}

AddWorkspace.defaultProps = {
  wikiCreationMessage: '',
};

AddWorkspace.propTypes = {
  wikiCreationMessage: PropTypes.string,
  onUpdateForm: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
};

const mapStateToProps = (state) => ({
  wikiCreationMessage: state.dialogAddWorkspace.wikiCreationMessage,
});

const actionCreators = {
  updateForm,
  save,
};

export default connectComponent(AddWorkspace, mapStateToProps, actionCreators);
